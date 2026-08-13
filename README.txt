BUSINESS DOCUMENT ANALYZER  —  runs in your browser, no install, no server
===========================================================================

Nothing to install. No Node. No local server. Everything runs in the
browser and stays on your machine.


------------------------------------------------------------------------
HOW TO OPEN IT
------------------------------------------------------------------------
Double-click  index.html.  That's it.

It works offline. Drop in a .docx / .xlsx / .csv / .txt / .md / .pdf and
it detects the document type and maps its content.

Tip: for the smoothest experience (reliable memory + on-device AI), open it
from a web address instead of a file — see "OPENING FROM A URL" below. It's
the same app either way; a URL just gives the browser a bit more room to
persist data and run the on-device model.


------------------------------------------------------------------------
THE BRAIN  (persists in your browser)
------------------------------------------------------------------------
Click "＋ Add to Brain" after analyzing a document. Each document is stored
in your browser and shared entities (stakeholders, actors, systems, metrics)
start cross-referencing across every document you add — "Business Analyst
appears in 3 documents", etc. Open the "🧠 Brain" tab to browse it.

The brain lives in this browser's local storage, so it's remembered the
next time you open the tool on this machine. To back it up or move it to
another computer, use Settings (⚙︎) → "Export brain" (saves a .json file)
and "Import brain" on the other machine.


------------------------------------------------------------------------
LIVING DOCUMENT — the "❓ Clarify" tab
------------------------------------------------------------------------
Every document gets a Clarify tab listing open questions. You answer one and
it's written back INTO the document:
  • BRD / SRS / PRD  → a new requirement (FR / NFR / INT / BR) that flows
    straight into Test Cases, Traceability and the score.
  • Charter / plan / process → a recorded clarification note.
Answers are saved to the brain and reload next time you open that document,
so it grows over time instead of resetting.


------------------------------------------------------------------------
AI  (optional — turn on in Settings ⚙︎)
------------------------------------------------------------------------
AI powers "✨ AI Insights" (use cases, assumptions, blockers) and the
"✨ Suggest clarifying questions" / "✨ Phrase as requirement" helpers.
It's OFF until you choose a provider in Settings. Options:

  1. In-browser model — WebLLM (the "local small model", no install/server).
     Runs a real open model (Qwen2.5 / Llama 3.2) INSIDE your browser using
     WebGPU. No API key, nothing leaves your machine. The first use downloads
     the model (~1–2 GB) and caches it; after that it runs locally, even
     offline. Needs a recent Chrome/Edge (WebGPU) and, for the one-time
     download, network access to the model CDN. This is the browser-native
     equivalent of Ollama and works on a hosted (GitHub Pages) site.

  2. On-device browser AI (Auto) — Chrome/Edge's built-in model (Gemini
     Nano), if your browser has it. Smallest and instant; no download.

  3. Approved cloud endpoint — if your company gives you an AI endpoint +
     key (OpenAI-compatible or Anthropic), paste them in Settings. The key
     is stored only in this browser and called directly from your machine.

If none is set up, everything except the AI features still works.

Note: Ollama itself cannot run on GitHub Pages (or any static host) — it
needs a server process, and static hosting has no server. Option 1 (WebLLM)
is how you get the same "small local model" experience with no server.


------------------------------------------------------------------------
OPENING FROM A URL  (optional, recommended)
------------------------------------------------------------------------
A plain file:// page is slightly restricted by browsers. Serving the same
files from a web address removes those limits (rock-solid persistence,
on-device AI, and the option to sync the brain to a real folder). You do NOT
need to run anything locally — just host these static files somewhere you're
allowed to, e.g.:
  • GitHub Pages (free static hosting) — open a URL like
    https://<you>.github.io/business-doc-analyzer
  • Any internal/company static host or intranet path.
Then open that URL instead of the file. Same app, same data model.

(Advanced/optional: server.js is included for anyone who CAN run Node and
wants a local http server; it is NOT required and most people should ignore
it.)


------------------------------------------------------------------------
FILES
------------------------------------------------------------------------
index.html         The app (open this).
lib/               Document parsers: mammoth (.docx), SheetJS (.xlsx), pdf.js.
js/
  semantic.js      Rule-based NLP: decomposes a requirement into parts.
  generate.js      Builds test steps from that meaning.
  quality.js       Quality scoring + gap findings.
  extract.js       Requirements, sections, flow, scenarios, tests.
  elements.js      Universal extractors (objectives, scope, stakeholders,
                   milestones, risks, personas, features, metrics, stories…).
  doctypes.js      Document-type classifier + per-type views.
  render.js        Document views (tabs) + shared helpers.
  store.js         The brain — persists in the browser (localStorage).
  llm.js           Pluggable AI: on-device model or approved cloud endpoint.
  brain.js         Builds the vault payload; brain API.
  brain_ui.js      The 🧠 Brain view.
  ai.js            The ✨ AI Insights tab.
  qa.js            The ❓ Clarify (living-document) tab.
  app.js           Orchestration, adaptive tabs, file loading, wiring.
server.js          OPTIONAL local http server (needs Node) — not required.
