# ZadLoop CI tracker

Follow a session's GitHub Actions runs live, under the ZadLoop message box.

- Appears only while a session has CI to show, and stays out of the way otherwise.
- **Collapsed:** status, repository, current job, steps done, and elapsed time on one line.
- **Expanded:** every workflow, job, and step with its status and duration, as on GitHub, plus a link to the run.
- **On failure:** opens itself, scrolls to the failed step, and shows the last lines of that step's log (for example the exact compiler or test error).
- Refreshes every 5 seconds while a run is active, every 20 seconds otherwise. A successful run hides itself after a minute; a failure stays until you dismiss it.

## Which runs it shows

The tracker reads the session's own history to find every Git repository the session worked in, including worktrees and repositories below its working directory. For those repositories it shows the runs that started during the session's latest activity or are still running: CI for a push, for a pull request the session opened, or for a branch it merged into.

## Install

1. Install the [GitHub CLI](https://cli.github.com/) and sign in: `gh auth login`.
2. In ZadLoop, open **Plugins → Add plugin → Install a third-party plugin** and enter:

```
https://github.com/ahmed-khaled-z/zadloop-ci-tracker
```

## Privacy

All requests go to GitHub through your own `gh` sign-in. The plugin stores no token and sends nothing elsewhere. Repositories your account cannot read are skipped silently.

## Requirements

- ZadLoop (DSH) `0.2.2-rc.1` or newer.
- `gh` installed and signed in; `git` on the PATH.
- Repositories hosted on GitHub with GitHub Actions.

## License

[MIT](LICENSE)
