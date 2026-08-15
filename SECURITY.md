# Security Policy

## Supported versions

This project is distributed as a static, client-side app with no backend. The
latest version on the `main` branch is the supported version; please make sure
you are running the latest files before reporting an issue.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately using **one** of the following:

- Open a private advisory via GitHub:
  **Security → Advisories → Report a vulnerability** on this repository, or
- Email **mujtaba.mohammed720@gmail.com** with the subject line
  `SECURITY: business-doc-analyzer`.

Please include, where possible:

- A description of the issue and its potential impact.
- Steps to reproduce (a minimal example is ideal).
- The browser and version you observed it in.
- Any relevant console output or screenshots (redact anything sensitive).

You can expect an acknowledgement within a few days. Once the issue is
confirmed, a fix will be prepared and released, and you'll be credited unless
you prefer to remain anonymous.

## Scope & notes

Because the app runs entirely in the browser and stores data in the browser's
local storage:

- No data is transmitted to any server by the core app. The **only** outbound
  network calls happen when you explicitly configure an AI provider in
  Settings, and then only to the endpoint you configured.
- API keys entered in Settings are stored in your browser's local storage and
  used directly from your machine. Treat the machine and browser profile
  accordingly.
- Documents you analyze are parsed locally and never uploaded by the core app.

Reports about the pluggable-AI configuration, document parsing (`.docx`,
`.xlsx`, `.pdf`), local-storage handling, or any way the app could leak data or
execute untrusted content are all in scope and appreciated.
