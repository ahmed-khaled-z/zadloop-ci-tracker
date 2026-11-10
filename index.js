/**
 * Host half of the CI tracker bundle.
 *
 * A Session often works across several repositories and worktrees below its
 * working directory, and its CI may run on a branch it merged into or a pull
 * request it opened rather than on the commit its worktree sits on. So the
 * tracker reads the Session's own log: every directory its tool calls worked in
 * or named, mapped to Git repositories and then to GitHub repositories. It then
 * lists those repositories' Actions runs that started during the Session's
 * latest activity, plus any still active, with their jobs, steps, and the tail
 * of a failed step's log, through the signed-in `gh` CLI. Served read-only to
 * the composer strip over one authenticated GET route.
 */

import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'

export const inject = ['webServer', 'connection', 'sessions', 'workingDirectory', 'subprocess']

const ROUTE_PATH = '/ci-tracker/status'
const EXEC_TIMEOUT_MS = 20_000
const STATUS_CACHE_MS = 5_000
const RUN_LIST_CACHE_MS = 6_000
const LOG_LINES = 40
/** Runs that started this long before the Session's last tool call still count as its own. */
const LOOKBACK_MS = 3 * 60 * 60_000
/** ...and runs that start this long after it (CI a merge or PR it made triggered). */
const FOLLOW_MS = 45 * 60_000
const MAX_DIRECTORIES = 60
const RUN_FIELDS = 'databaseId,name,workflowName,displayTitle,status,conclusion,headSha,headBranch,url,createdAt,updatedAt,event'

function run(file, args, cwd, env) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd, env, timeout: EXEC_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = String(stderr || '').trim().slice(0, 300)
        reject(error)
        return
      }
      resolve(String(stdout))
    })
  })
}

/** Drop ANSI colours and the job/step/timestamp prefix `gh run view --log-failed` puts on every line. */
function stripPrefix(line) {
  const noAnsi = line.replace(/\u001b\[[0-9;]*m/g, '')
  const parts = noAnsi.split('\t')
  const text = parts.length >= 3 ? parts.slice(2).join('\t') : noAnsi
  return text.replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '')
}

/**
 * The failing step's own output. `--log-failed` returns the whole job (its step
 * column often reads UNKNOWN STEP), so the failing step is the region from the
 * last `##[group]Run` header before the last `##[error]` line up to that error;
 * the post-job cleanup after it is dropped.
 */
function failingSection(lines) {
  let lastError = -1
  for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].startsWith('##[error]')) { lastError = i; break }
  if (lastError === -1) return lines
  let start = 0
  for (let i = lastError; i >= 0; i -= 1) if (lines[i].startsWith('##[group]Run ')) { start = i; break }
  return lines.slice(start, lastError + 1)
}

function cleanLogLine(line) {
  return line.replace(/^##\[(error|group|endgroup|warning)\]/, '').replace(/^Run /, '$ ')
}

/** owner/name of a GitHub remote URL (https or ssh), or undefined for another host. */
function githubRepo(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(url).trim())
  return m ? `${m[1]}/${m[2]}` : undefined
}

/** Directories one tool call worked in or named: workdir/cwd/path arguments, cd targets, and git -C paths. */
function directoriesOfCall(args, base) {
  const found = []
  const add = (p, from) => {
    if (typeof p !== 'string' || !p || p.length > 500) return
    const cleaned = p.replace(/^['"]|['"]$/g, '').replace(/^~(?=\/)/, process.env.HOME || '~')
    if (!isAbsolute(cleaned) && !from) return
    found.push(isAbsolute(cleaned) ? cleaned : resolvePath(from, cleaned))
  }
  const workdir = typeof args.workdir === 'string' ? args.workdir : typeof args.cwd === 'string' ? args.cwd : undefined
  const here = workdir && isAbsolute(workdir) ? workdir : base
  add(workdir, base)
  for (const key of ['file_path', 'path', 'directory', 'dir']) add(args[key], here)
  const command = typeof args.command === 'string' ? args.command : ''
  if (command) {
    for (const m of command.matchAll(/(?:^|[;&|(\s])cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) add(m[1], here)
    for (const m of command.matchAll(/git\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) add(m[1], here)
    for (const m of command.matchAll(/(?:^|[\s"'=(])(\/(?:Users|home|private|tmp|Volumes)\/[^\s"'`;|&()<>$]+)/g)) add(m[1])
  }
  return found
}

export function apply(ctx) {
  let tools
  const statusCache = new Map()
  const inflight = new Map()
  const scans = new Map()
  const toplevelCache = new Map()
  const remoteCache = new Map()
  const runListCache = new Map()
  const jobCache = new Map()
  const logCache = new Map()

  async function resolveTools() {
    if (tools) return tools
    const find = async (name, fallbacks) => {
      try {
        return await ctx.subprocess.resolveExecutable(name)
      } catch {
        return fallbacks.find(Boolean)
      }
    }
    const gh = await find('gh', ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'])
    const git = await find('git', ['/usr/bin/git'])
    const extraPath = [gh, git].filter(Boolean).map((p) => dirname(p))
    const env = { ...process.env, PATH: [...new Set([...extraPath, ...(process.env.PATH || '').split(':')])].join(':'), GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }
    tools = { gh, git, env }
    return tools
  }

  function sessionDirectory(session) {
    try {
      return ctx.workingDirectory.get(session)
    } catch {
      return session.header?.cwd
    }
  }

  /**
   * Fold the Session's new events into its scan: the directories its tool calls
   * touched and the time of its first and last tool call. Only events after the
   * previous scan are read.
   */
  function scanSession(sessionId) {
    const session = ctx.sessions.get(sessionId)
    if (!session) return undefined
    const cwd = sessionDirectory(session)
    let scan = scans.get(sessionId)
    if (!scan) {
      scan = { seq: 0, dirs: new Set(), first: undefined, last: undefined }
      scans.set(sessionId, scan)
    }
    if (cwd) scan.dirs.add(cwd)
    let events = []
    try {
      events = session.snapshotEvents(scan.seq)
    } catch {
      events = []
    }
    for (const event of events) {
      if (typeof event?.seq === 'number' && event.seq + 1 > scan.seq) scan.seq = event.seq + 1
      if (event?.type !== 'tool/call') continue
      const time = typeof event.time === 'number' ? event.time : undefined
      if (time !== undefined) {
        if (scan.first === undefined) scan.first = time
        scan.last = time
      }
      let args
      try {
        args = typeof event.data?.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data?.arguments
      } catch {
        args = undefined
      }
      if (args && typeof args === 'object') for (const dir of directoriesOfCall(args, cwd)) scan.dirs.add(dir)
    }
    try {
      if (typeof session.seq === 'number' && session.seq > scan.seq) scan.seq = session.seq
    } catch { /* keep the event-derived position */ }
    return { cwd, dirs: [...scan.dirs], first: scan.first, last: scan.last }
  }

  /** Git top-level of a path (a file resolves through its directory); cached, null when outside any repository. */
  async function toplevelOf(path, t) {
    if (toplevelCache.has(path)) return toplevelCache.get(path)
    let dir = path
    try {
      if (!statSync(path).isDirectory()) dir = dirname(path)
    } catch {
      dir = dirname(path)
      try { statSync(dir) } catch { toplevelCache.set(path, null); return null }
    }
    let top = null
    try {
      top = (await run(t.git, ['-C', dir, 'rev-parse', '--show-toplevel'], dir, t.env)).trim() || null
    } catch {
      top = null
    }
    toplevelCache.set(path, top)
    return top
  }

  async function remoteOf(top, t) {
    if (remoteCache.has(top)) return remoteCache.get(top)
    let repo
    try {
      repo = githubRepo(await run(t.git, ['-C', top, 'remote', 'get-url', 'origin'], top, t.env))
    } catch {
      repo = undefined
    }
    remoteCache.set(top, repo)
    return repo
  }

  /** GitHub repositories the Session worked in, each with one local checkout to run `gh` from. */
  async function repositoriesOf(scan, t) {
    const dirs = scan.dirs.slice(-MAX_DIRECTORIES)
    const tops = new Set((await Promise.all(dirs.map((d) => toplevelOf(d, t)))).filter(Boolean))
    const repos = new Map()
    for (const top of tops) {
      const repo = await remoteOf(top, t)
      if (repo && !repos.has(repo)) repos.set(repo, top)
    }
    return repos
  }

  /** One repository's recent runs, shared by every Session that touches it. */
  async function runList(repo, cwd, t) {
    const hit = runListCache.get(repo)
    if (hit && Date.now() - hit.at < RUN_LIST_CACHE_MS) return hit.value
    let value
    try {
      value = { runs: JSON.parse(await run(t.gh, ['run', 'list', '--repo', repo, '--limit', '25', '--json', RUN_FIELDS], cwd, t.env)) }
    } catch (error) {
      const message = error.stderr || String(error.message || error)
      value = /HTTP 40[34]|Could not resolve to a Repository/i.test(message) ? { runs: [] } : { error: message.slice(0, 200) }
    }
    runListCache.set(repo, { at: Date.now(), value })
    return value
  }

  /** Jobs and steps of one run; a completed run's jobs never change, so they are kept. */
  async function jobsOf(repo, runInfo, cwd, t) {
    const done = runInfo.status === 'completed'
    const cached = jobCache.get(runInfo.databaseId)
    if (cached && done && cached.done) return cached.jobs
    const reply = JSON.parse(await run(t.gh, ['run', 'view', String(runInfo.databaseId), '--repo', repo, '--json', 'jobs'], cwd, t.env))
    const jobs = (reply.jobs || []).map((job) => ({
      id: job.databaseId,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion || null,
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      url: job.url,
      steps: (job.steps || []).map((step) => ({
        number: step.number,
        name: step.name,
        status: step.status,
        conclusion: step.conclusion || null,
        startedAt: step.startedAt || null,
        completedAt: step.completedAt || null,
      })),
    }))
    jobCache.set(runInfo.databaseId, { done, jobs })
    return jobs
  }

  /** The last lines of a failed job's failing step; GitHub serves them once the job has finished. */
  async function failedLog(repo, jobId, cwd, t) {
    if (logCache.has(jobId)) return logCache.get(jobId)
    let lines
    try {
      const text = await run(t.gh, ['run', 'view', '--repo', repo, '--job', String(jobId), '--log-failed'], cwd, t.env)
      lines = failingSection(text.split('\n').map(stripPrefix)).map(cleanLogLine).filter((line) => line.trim() !== '').slice(-LOG_LINES)
    } catch {
      return null
    }
    logCache.set(jobId, lines)
    return lines
  }

  /**
   * Runs of this repository that belong to the Session's latest activity: started
   * between LOOKBACK before its last tool call and FOLLOW after it, or still active
   * and started after that window opened. Per workflow and branch only the newest
   * run counts, and a cancelled run is dropped when a newer run of its workflow exists.
   */
  function sessionRuns(runs, scan) {
    const last = scan.last ?? Date.now()
    const from = Math.max(scan.first ?? last, last - LOOKBACK_MS) - 5 * 60_000
    const to = last + FOLLOW_MS
    const inWindow = runs.filter((r) => {
      const created = Date.parse(r.createdAt)
      if (!Number.isFinite(created) || created < from) return false
      return created <= to || r.status !== 'completed'
    })
    const newest = new Map()
    for (const r of inWindow) {
      const key = `${r.workflowName || r.name}\n${r.headBranch}`
      const seen = newest.get(key)
      if (!seen || Date.parse(r.createdAt) > Date.parse(seen.createdAt)) newest.set(key, r)
    }
    const chosen = [...newest.values()]
    return chosen
      .filter((r) => !(r.conclusion === 'cancelled' && chosen.some((o) => o !== r
        && (o.workflowName || o.name) === (r.workflowName || r.name)
        && Date.parse(o.createdAt) > Date.parse(r.createdAt))))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  }

  async function collect(sessionId) {
    const scan = scanSession(sessionId)
    if (!scan) return { state: 'none', reason: 'no-session' }
    const t = await resolveTools()
    if (!t.gh || !t.git) return { state: 'none', reason: 'no-gh' }
    const repos = await repositoriesOf(scan, t)
    if (repos.size === 0) return { state: 'none', reason: 'no-github' }
    const errors = []
    const perRepo = await Promise.all([...repos].map(async ([repo, checkout]) => {
      const listed = await runList(repo, checkout, t)
      if (listed.error) { errors.push(`${repo}: ${listed.error}`); return [] }
      return Promise.all(sessionRuns(listed.runs, scan).map(async (r) => {
        let jobs = []
        let jobsError
        try {
          jobs = await jobsOf(repo, r, checkout, t)
        } catch (error) {
          jobsError = (error.stderr || String(error.message || error)).slice(0, 200)
        }
        const withLogs = await Promise.all(jobs.map(async (job) => (
          job.status === 'completed' && job.conclusion === 'failure'
            ? { ...job, log: await failedLog(repo, job.id, checkout, t) }
            : job
        )))
        return {
          id: r.databaseId,
          repo,
          workflow: r.workflowName || r.name,
          title: r.displayTitle,
          branch: r.headBranch,
          sha: r.headSha,
          event: r.event,
          status: r.status,
          conclusion: r.conclusion || null,
          url: r.url,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          jobs: withLogs,
          ...(jobsError ? { jobsError } : {}),
        }
      }))
    }))
    const runs = perRepo.flat().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    if (runs.length === 0) {
      return errors.length
        ? { state: 'error', message: errors[0] }
        : { state: 'none', reason: 'no-runs', repos: [...repos.keys()] }
    }
    return { state: 'runs', repos: [...repos.keys()], runs, fetchedAt: Date.now() }
  }

  /** One read per Session at a time, reused for a few seconds so several tabs never multiply GitHub calls. */
  function status(sessionId, force) {
    const cached = statusCache.get(sessionId)
    if (!force && cached && Date.now() - cached.at < STATUS_CACHE_MS) return Promise.resolve(cached.value)
    if (inflight.has(sessionId)) return inflight.get(sessionId)
    const p = collect(sessionId)
      .then((value) => {
        statusCache.set(sessionId, { at: Date.now(), value })
        return value
      })
      .finally(() => inflight.delete(sessionId))
    inflight.set(sessionId, p)
    return p
  }

  const rejected = (req, res) => {
    let rejection = ctx.connection.requestRejection(req)
    if (rejection === undefined) {
      const remote = String(req.socket?.remoteAddress ?? '')
      if (!(remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) rejection = 403
    }
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return
      }
      const url = new URL(String(req.url), 'http://localhost')
      const sessionId = url.searchParams.get('session') || ''
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      if (!sessionId) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'session is required' }))
        return
      }
      try {
        res.statusCode = 200
        res.end(JSON.stringify(await status(sessionId, url.searchParams.get('force') === '1')))
      } catch (error) {
        res.statusCode = 500
        res.end(JSON.stringify({ state: 'error', message: String(error?.message || error).slice(0, 200) }))
      }
    },
  }), `ci-tracker: GET ${ROUTE_PATH}`)
}
