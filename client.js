window.__ModuleLoader__.load({
  id: '@ahmed-khaled-z/zadloop-ci-tracker',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useSyncExternalStore } = React;

    const NS = 'local.ciTracker';
    const STYLE_ID = 'local-ci-tracker-style';
    const ROUTE = 'ci-tracker/status';
    const ACTIVE_POLL_MS = 5000;
    const IDLE_POLL_MS = 20000;
    const SUCCESS_LINGER_MS = 60000;
    const DISMISS_KEY = '@local/ci-tracker:dismissed:v1';

    const en = {
      running: 'CI running',
      queued: 'CI queued',
      success: 'CI passed',
      failure: 'CI failed',
      cancelled: 'CI cancelled',
      steps: '{done}/{total} steps',
      repos: '{n} repositories',
      expand: 'Show CI details',
      collapse: 'Hide CI details',
      dismiss: 'Dismiss',
      openRun: 'Open on GitHub',
      log: 'Last lines of the failed step',
      logPending: 'The log is available once the job finishes.',
      noJobs: 'Waiting for jobs to start…',
      jobsError: 'Could not read the jobs: {message}',
      error: 'Could not read CI: {message}',
    };
    const ar = {
      running: 'CI قيد التشغيل',
      queued: 'CI في الانتظار',
      success: 'CI نجح',
      failure: 'CI فشل',
      cancelled: 'CI أُلغي',
      steps: '{done}/{total} خطوات',
      repos: '{n} مستودعات',
      expand: 'إظهار تفاصيل CI',
      collapse: 'إخفاء تفاصيل CI',
      dismiss: 'إغلاق',
      openRun: 'فتح على GitHub',
      log: 'آخر سطور الخطوة الفاشلة',
      logPending: 'السجل يتاح بعد انتهاء الـjob.',
      noJobs: 'في انتظار بدء الـjobs…',
      jobsError: 'تعذّرت قراءة الـjobs: {message}',
      error: 'تعذّرت قراءة CI: {message}',
    };

    const CSS = `
.lci{box-sizing:border-box;width:100%;margin-top:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden}
.lci[data-state=failure]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent)}
.lci-head{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:6px 8px 6px 12px;box-sizing:border-box}
.lci-toggle{display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:0;border:none;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:start}
.lci-toggle:focus-visible,.lci-icon-btn:focus-visible,.lci-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}
.lci-title{font-weight:500;white-space:nowrap}
.lci-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.lci-time{margin-inline-start:auto;flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.lci-icon-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
@media(hover:hover){.lci-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.lci-chev{transition:transform .15s}
.lci[data-open=true] .lci-chev{transform:rotate(180deg)}
.lci-body{direction:ltr;text-align:left;max-height:min(46vh,420px);overflow:auto;padding:2px 12px 10px;border-top:.5px solid var(--dsw-alias-border-l1)}
.lci-run{padding-top:8px}
.lci-run+.lci-run{margin-top:6px;border-top:.5px solid var(--dsw-alias-border-l1)}
.lci-run-head{display:flex;align-items:center;gap:8px;padding:2px 0 4px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.lci-branch{margin-inline-start:6px;padding:0 6px;border-radius:6px;background:var(--dsw-alias-bg-base);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.lci-link{margin-inline-start:auto;color:var(--dsw-alias-brand-primary);text-decoration:none;white-space:nowrap}
.lci-link:hover{text-decoration:underline}
.lci-job{display:flex;align-items:center;gap:8px;padding:4px 0;font-weight:500}
.lci-steps{list-style:none;margin:0 0 4px;padding:0}
.lci-step{display:flex;align-items:center;gap:8px;padding:3px 0;padding-inline-start:22px;color:var(--dsw-alias-label-primary)}
.lci-step[data-state=pending]{color:var(--dsw-alias-label-secondary)}
.lci-step[data-state=failure]{color:var(--dsw-alias-state-error-primary);font-weight:500}
.lci-step-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lci-run-head .lci-link{direction:auto;unicode-bidi:plaintext}
.lci-dur{flex:none;font-variant-numeric:tabular-nums;font-size:12px;color:var(--dsw-alias-label-secondary)}
.lci-log{margin:4px 0 8px;padding-inline-start:22px}
.lci-log-label{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}
.lci-log pre{margin:0;max-height:220px;overflow:auto;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word;direction:ltr;text-align:left}
.lci-note{font-size:12px;color:var(--dsw-alias-label-secondary);padding:4px 0;padding-inline-start:22px}
.lci-st{flex:none;display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center}
.lci-st[data-state=success]{color:var(--dsw-alias-state-success-primary)}
.lci-st[data-state=failure]{color:var(--dsw-alias-state-error-primary)}
.lci-st[data-state=running]{color:var(--dsw-alias-state-warn-primary)}
.lci-st[data-state=pending],.lci-st[data-state=skipped],.lci-st[data-state=cancelled]{color:var(--dsw-alias-label-secondary)}
.lci-spin{animation:lci-spin 1s linear infinite;transform-origin:50% 50%}
@keyframes lci-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.lci-spin{animation:none}.lci-chev{transition:none}}
`;

    // ------------------------------------------------------------ status helpers

    /** One state for a step, job, or run: running | pending | success | failure | cancelled | skipped. */
    function stateOf(item) {
      if (!item) return 'pending';
      if (item.status === 'in_progress') return 'running';
      if (item.status !== 'completed') return 'pending';
      const c = item.conclusion;
      if (c === 'success' || c === 'neutral') return 'success';
      if (c === 'skipped') return 'skipped';
      if (c === 'cancelled') return 'cancelled';
      return 'failure';
    }

    function overall(runs) {
      const states = runs.map(stateOf);
      if (states.includes('running')) return 'running';
      if (states.includes('pending')) return states.includes('failure') ? 'running' : 'queued';
      if (states.includes('failure')) return 'failure';
      if (states.length && states.every((s) => s === 'cancelled')) return 'cancelled';
      return 'success';
    }

    function ms(value) {
      const n = value ? Date.parse(value) : NaN;
      // GitHub writes 0001-01-01 for a time that has not happened yet.
      return Number.isFinite(n) && n > 946684800000 ? n : undefined;
    }

    function duration(fromIso, toIso, now) {
      const from = ms(fromIso);
      if (from === undefined) return '';
      const to = ms(toIso) ?? now;
      const s = Math.max(0, Math.round((to - from) / 1000));
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
      return `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    function runsWindow(runs) {
      const starts = runs.map((r) => ms(r.createdAt)).filter((v) => v !== undefined);
      const ends = runs.map((r) => (stateOf(r) === 'running' || stateOf(r) === 'pending' ? undefined : ms(r.updatedAt)));
      return {
        start: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
        end: ends.some((v) => v === undefined) ? null : new Date(Math.max(...ends)).toISOString(),
      };
    }

    function repoName(repo) {
      return String(repo || '').split('/').pop();
    }

    function runSetKey(data) {
      return data.runs.map((r) => `${r.id}.${r.updatedAt}`).join(',');
    }

    function readDismissed() {
      try {
        const v = JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]');
        return Array.isArray(v) ? v : [];
      } catch (_e) { return []; }
    }
    function writeDismissed(list) {
      try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50))); } catch (_e) { /* storage unavailable */ }
    }

    // ------------------------------------------------------------ glyphs

    function StatusIcon({ state }) {
      const p = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
      let glyph;
      switch (state) {
        case 'success': glyph = h('svg', p, h('circle', { cx: 8, cy: 8, r: 6.5 }), h('path', { d: 'M5.2 8.2l1.9 1.9 3.7-3.9' })); break;
        case 'failure': glyph = h('svg', p, h('circle', { cx: 8, cy: 8, r: 6.5 }), h('path', { d: 'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4' })); break;
        case 'running': glyph = h('svg', { ...p, className: 'lci-spin' }, h('path', { d: 'M8 1.5a6.5 6.5 0 1 1-6.5 6.5' })); break;
        case 'cancelled': glyph = h('svg', p, h('circle', { cx: 8, cy: 8, r: 6.5 }), h('path', { d: 'M5 8h6' })); break;
        case 'skipped': glyph = h('svg', p, h('circle', { cx: 8, cy: 8, r: 6.5 }), h('path', { d: 'M5 11L11 5' })); break;
        default: glyph = h('svg', p, h('circle', { cx: 8, cy: 8, r: 6.5, strokeDasharray: '2.5 2.5' }));
      }
      return h('span', { className: 'lci-st', 'data-state': state }, glyph);
    }

    function Chevron() {
      return h('svg', { className: 'lci-chev', width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M4 6l4 4 4-4' }));
    }

    function Close() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M4 4l8 8M12 4l-8 8' }));
    }

    // ------------------------------------------------------------ views

    function Job({ job, now, t }) {
      const jobState = stateOf(job);
      const failedStep = job.steps.find((step) => stateOf(step) === 'failure');
      const logView = [
        h('div', { key: 'l', className: 'lci-log-label' }, t('log')),
        Array.isArray(job.log) && job.log.length
          ? h('pre', { key: 'p' }, job.log.join('\n'))
          : h('div', { key: 'n', className: 'lci-note' }, t('logPending')),
      ];
      return h('div', null,
        h('div', { className: 'lci-job' },
          h(StatusIcon, { state: jobState }),
          h('span', { className: 'lci-step-name' }, job.name),
          h('span', { className: 'lci-dur' }, duration(job.startedAt, job.completedAt, now))),
        h('ul', { className: 'lci-steps' }, job.steps.map((step) => {
          const s = stateOf(step);
          // The failed step carries its log right under it; a job that failed outside its steps shows it at the end.
          const logHere = jobState === 'failure' && step === failedStep;
          return h(React.Fragment, { key: step.number },
            h('li', { className: 'lci-step', 'data-state': s },
              h(StatusIcon, { state: s }),
              h('span', { className: 'lci-step-name', title: step.name }, step.name),
              h('span', { className: 'lci-dur' }, s === 'pending' || s === 'skipped' ? '' : duration(step.startedAt, step.completedAt, now))),
            logHere ? h('li', { className: 'lci-log' }, logView) : null);
        })),
        jobState === 'failure' && !failedStep ? h('div', { className: 'lci-log' }, logView) : null);
    }

    function Run({ run, now, t }) {
      return h('section', { className: 'lci-run' },
        h('div', { className: 'lci-run-head' },
          h(StatusIcon, { state: stateOf(run) }),
          h('span', { className: 'lci-step-name' }, `${repoName(run.repo)} · ${run.workflow}`, run.branch ? h('span', { className: 'lci-branch' }, run.branch) : null),
          h('a', { className: 'lci-link', href: run.url, target: '_blank', rel: 'noreferrer noopener' }, `${t('openRun')} ↗`)),
        run.jobsError ? h('div', { className: 'lci-note' }, t('jobsError', { message: run.jobsError })) : null,
        !run.jobsError && run.jobs.length === 0 ? h('div', { className: 'lci-note' }, t('noJobs')) : null,
        run.jobs.map((job) => h(Job, { key: job.id, job, now, t })));
    }

    function CiStrip({ sessionId, useT }) {
      const t = useT();
      const [data, setData] = useState(null);
      const [open, setOpen] = useState(false);
      const [now, setNow] = useState(() => Date.now());
      const [dismissed, setDismissed] = useState(readDismissed);
      const seenDone = useRef(new Map());
      const autoOpened = useRef('');
      const bodyRef = useRef(null);
      const scrolledFor = useRef('');

      useEffect(() => {
        if (!sessionId) return undefined;
        let alive = true;
        let timer = 0;
        setData(null);
        setOpen(false);
        const tick = async () => {
          let next = null;
          try {
            const response = await fetch(`${ROUTE}?session=${encodeURIComponent(sessionId)}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
            if (response.ok) next = await response.json();
          } catch (_e) { next = null; }
          if (!alive) return;
          if (next) setData(next);
          const active = next && next.state === 'runs' && next.runs.some((r) => r.status !== 'completed');
          const delay = document.visibilityState === 'hidden' ? IDLE_POLL_MS * 3 : active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
          timer = window.setTimeout(tick, delay);
        };
        tick();
        const onVisible = () => {
          if (document.visibilityState === 'visible') { window.clearTimeout(timer); tick(); }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => { alive = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
      }, [sessionId]);

      const RANK = { running: 0, pending: 1, failure: 2, cancelled: 3, skipped: 4, success: 5 };
      const runs = data && data.state === 'runs'
        ? [...data.runs].sort((a, b) => RANK[stateOf(a)] - RANK[stateOf(b)] || Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : [];
      const state = runs.length ? overall(runs) : null;
      const key = data && data.state === 'runs' ? runSetKey(data) : '';
      const ticking = state === 'running' || state === 'queued' || state === 'success';
      useEffect(() => {
        if (!ticking) return undefined;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
      }, [ticking]);

      // A failure opens the details once, so the failing step and its log are in view.
      useEffect(() => {
        if (state === 'failure' && key && autoOpened.current !== key) { autoOpened.current = key; setOpen(true); }
      }, [state, key]);

      // Once per failure, bring the failed step and its log into view inside the details (not the page).
      useEffect(() => {
        const body = bodyRef.current;
        if (!open || state !== 'failure' || !body || scrolledFor.current === key) return;
        const step = body.querySelector('.lci-step[data-state=failure]');
        if (!step) return;
        scrolledFor.current = key;
        body.scrollTop = Math.max(0, step.offsetTop - body.offsetTop - 48);
      });

      if (!state || !key || dismissed.includes(key)) return null;
      // A success stays for a minute after it finished (or after we first saw it finished), then hides itself.
      if (state === 'success' || state === 'cancelled') {
        const finished = ms(runsWindow(runs).end) ?? Date.now();
        if (!seenDone.current.has(key)) seenDone.current.set(key, Math.max(finished, Date.now() - SUCCESS_LINGER_MS / 2));
        if (now - seenDone.current.get(key) > SUCCESS_LINGER_MS && !open) return null;
      }

      const steps = runs.flatMap((r) => r.jobs.flatMap((j) => j.steps));
      const doneSteps = steps.filter((s) => s.status === 'completed').length;
      const runningJob = runs.flatMap((r) => r.jobs).find((j) => stateOf(j) === 'running');
      const failedJob = runs.flatMap((r) => r.jobs).find((j) => stateOf(j) === 'failure');
      const focusJob = failedJob || runningJob;
      const focusRun = runs.find((r) => focusJob && r.jobs.includes(focusJob)) || (runs.length === 1 ? runs[0] : undefined);
      const repoCount = new Set(runs.map((r) => r.repo)).size;
      // The header times what is happening now: the active runs while any run, otherwise all of them.
      const active = runs.filter((r) => stateOf(r) === 'running' || stateOf(r) === 'pending');
      const win = runsWindow(active.length ? active : runs);
      const meta = [
        focusRun ? repoName(focusRun.repo) : null,
        repoCount > 1 ? t('repos', { n: repoCount }) : null,
        focusJob ? focusJob.name : null,
        steps.length ? t('steps', { done: doneSteps, total: steps.length }) : null,
      ].filter(Boolean).join(' · ');
      const dismiss = () => {
        const next = [...dismissed, key];
        setDismissed(next);
        writeDismissed(next);
      };

      return h('div', { className: 'lci', 'data-state': state === 'queued' ? 'running' : state, 'data-open': open ? 'true' : 'false' },
        h('div', { className: 'lci-head' },
          h('button', {
            type: 'button', className: 'lci-toggle', 'aria-expanded': open,
            'aria-label': open ? t('collapse') : t('expand'),
            onClick: () => setOpen((v) => !v),
          },
          h(StatusIcon, { state: state === 'queued' ? 'pending' : state }),
          h('span', { className: 'lci-title', 'aria-live': 'polite' }, t(state)),
          h('span', { className: 'lci-meta' }, meta),
          h('span', { className: 'lci-time' }, duration(win.start, win.end, now)),
          h(Chevron)),
          state === 'running' || state === 'queued'
            ? null
            : h('button', { type: 'button', className: 'lci-icon-btn', 'aria-label': t('dismiss'), title: t('dismiss'), onClick: dismiss }, h(Close))),
        open ? h('div', { ref: bodyRef, className: 'lci-body' }, runs.map((run) => h(Run, { key: run.id, run, now, t }))) : null);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en }), 'local-ci-tracker: en');
        ctx.effect(() => ctx.locale.register(NS, 'ar', ar), 'local-ci-tracker: ar');
        const t = ctx.locale.bind(NS);
        const useT = () => {
          useSyncExternalStore(ctx.locale.subscribe.bind(ctx.locale), () => ctx.locale.getSnapshot());
          return t;
        };

        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.id = STYLE_ID;
          tag.dataset.plugin = '@ahmed-khaled-z/zadloop-ci-tracker';
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'local-ci-tracker: styles');

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'local-ci-tracker',
          // Before the session stats (order 0 and 1), so they stay together with the context meter below.
          order: -100,
          locale: NS,
          inject: () => ({ useT }),
        }, CiStrip));
      },
    };
  },
});
