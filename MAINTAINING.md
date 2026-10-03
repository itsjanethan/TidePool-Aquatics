# Maintainer workflow

The product owner sets priorities, gameplay direction and acceptance criteria. The maintainer implements changes, investigates failures, validates releases and keeps the repository documentation current.

1. Start from current `main` on a short-lived branch. Read the contributor documents listed in README.md and keep each change focused.
2. Use Node 22 and `npm ci` to install the committed lockfile. Run `BASE_PATH=/TidePool-Aquatics/ npm run check` before proposing a merge (PowerShell: `$env:BASE_PATH='/TidePool-Aquatics/'; npm run check`). This includes types, lint, all tests and the production build.
3. Open a pull request. The Repository checks workflow runs the same validation without publishing. Exercise relevant browser checks for gameplay or visual changes.
4. Merge only after checks pass on the current PR revision. Recommend a main-branch ruleset requiring pull requests and the `check` status, blocking force pushes and deletion. Configure this in repository settings; this document does not enable protection.
5. A merge into `main` triggers Deploy to GitHub Pages. Confirm the build and deploy jobs both succeed, then check the public game, version, nested asset paths and save/load. Pages must use GitHub Actions as its source.
6. Keep generated builds and dependencies out of Git. Preserve history: never force push or rewrite `main`; roll back regressions with a revert pull request.

Long-run simulation tests have individual finite timeouts. The 30-day test allows 30 seconds; its seed, simulated days and assertions are unchanged. The default timeout for other tests remains unchanged. Diagnose performance regressions rather than repeatedly increasing limits.

The staff-only long-run scenario tests robustness, not profitability. The played level-4 scenario separately requires solvency. Balance changes need product-owner direction and the balance tests described in TESTING.md.
