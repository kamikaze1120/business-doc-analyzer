# Contributing

Thanks for your interest in improving **Business Document Analyzer**! This is a small, dependency-light project and contributions of all sizes are welcome — bug reports, fixes, new document-type support, extractors, or docs.

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

- **No build step.** The app is plain HTML + vanilla JavaScript loaded with classic `<script>` tags. Please keep it that way — no bundlers, frameworks, or npm runtime dependencies in the app itself.
- **Everything stays local.** Core features must work fully offline in the browser with no server and no network calls. AI is optional and pluggable; never make a network call a requirement for a core feature.
- **Match the surrounding style.** Terse vanilla JS, small focused modules in `js/`, shared globals loaded in order (see the `<script>` tags at the bottom of `index.html`).

## Getting set up

1. Fork and clone the repo.
2. Open `index.html` directly in a browser, or serve the folder from any static host / simple HTTP server.
3. Make your change in the relevant `js/` module (see the "Project layout" section of the [README](README.md) for what each file does).

## Testing

The repo ships headless test harnesses that run the engine and UI against sample documents. Before opening a PR:

- Run the existing test scripts and make sure they pass with **zero console/page errors**.
- If you add or change behavior, add or update a test that covers it.
- Manually smoke-test in the browser: load a sample document, verify the affected tab renders, and check the browser console is clean.

## Submitting a pull request

1. Create a branch for your change.
2. Keep the change focused; one logical change per PR.
3. Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) — what changed, why, and how you tested it.
4. Make sure the app still opens and works from a plain `file://` page (offline) as well as when hosted.

## Reporting bugs & requesting features

Use the issue templates:

- **Bug report** — steps to reproduce, the document type involved (redact anything sensitive), browser, and what you expected vs. what happened.
- **Feature request** — the problem you're trying to solve and the outcome you want.

## Security

Please do **not** open a public issue for security problems. See [SECURITY.md](SECURITY.md) for how to report them privately.
