# Business Document Analyzer

**Runs entirely in your browser. No install, no Node, no server. Your documents never leave your machine.**

Drop in a business document — a BRD, PRD, project charter, requirements spec, process doc, spreadsheet — and it detects the document type, maps the content, extracts requirements, generates test cases, scores quality, and builds a persistent, cross-referencing knowledge base (the "brain"). Optionally, plug in an LLM to draft, suggest, and interview you through building new documents from scratch.

> 100% local · works offline · optional pluggable AI

---

## Quick start

**Option A — just open it.** Double-click `index.html`. That's it. It works offline. Drop in a `.docx` / `.xlsx` / `.csv` / `.txt` / `.md` / `.pdf` and it analyzes it.

**Option B — host it (recommended).** Serving the static files from a URL gives the browser more room to persist data reliably and run on-device AI. You do **not** need to run anything — just host the static files anywhere you're allowed to:

- **GitHub Pages** (free): `https://<you>.github.io/business-doc-analyzer`
- Any internal/company static host or intranet path.

Same app, same data model — a URL just removes the minor restrictions browsers place on `file://` pages.

---

## What it does

### 📄 Document analysis
Detects the document type (BRD/SRS, PRD, Project Charter, Agile backlog, process doc, or generic) and adapts its views to match. For each document it extracts:

- **Requirements** classified as Functional / Non-Functional / Integration / Business Rule, each decomposed into actor · action · object.
- **Test cases** generated from those requirements, with steps, preconditions, expected results, and traceability — exportable to CSV.
- **Elements**: objectives, scope (in/out), stakeholders, milestones, risks, personas, features, metrics, user stories.
- **Quality score + gap findings** so you can see what's missing or ambiguous.

### 🧠 The Brain (persistent, cross-referencing)
Click **＋ Add to Brain** after analyzing a document. Everything is stored in your browser and shared entities start cross-referencing across every document you add — *"Business Analyst appears in 3 documents"*, *"Billing API is referenced by 2 charters"*. Open the **🧠 Brain** tab to browse an Obsidian-style graph of documents and entities, filter it, and follow the links.

The brain lives in this browser's local storage, so it persists between sessions. Back it up or move it with **Settings (⚙︎) → Export brain / Import brain** (a `.json` file).

### 📁 Projects — guided document builder
Pick a document type (BRD, PRD, or Project Charter) and the system **interviews you section by section**. Each project gets its own workspace with separated sub-tabs:

- **Setup** → the document header (name, version, author, department, date).
- **General Idea** → a few sentences of purpose; everything else builds from this.
- **Per-section tabs** → Functional, Non-Functional, Integration, Business Rules, Scope, Stakeholders, Risks (adapt to the type). Each shows a ✓ once it has content.
- **Review & Generate** → a completeness check, then one click assembles a complete document and runs the full engine over it — requirements, test cases, traceability, and gap analysis. Download as `.md`.

Projects **persist** — you don't need all the answers at once; come back and keep filling it in. It prefills hints from the brain (known systems, known roles), and when an LLM is configured it can suggest items per section or draft the whole thing from your idea.

### ❓ Clarify — the living document
Every document gets a **Clarify** tab of open questions. Answer one and it's written back *into* the document:

- BRD / SRS / PRD → a new requirement (FR / NFR / INT / BR) that flows straight into Test Cases, Traceability, and the score.
- Charter / plan / process → a recorded clarification note.

Answers are saved to the brain and reload next time you open that document, so it grows over time instead of resetting.

### 🛠 Compose from the brain
Generate cross-document artifacts from everything the brain knows — Project Brief, Stakeholder Register, Risk Register, Requirements Traceability Matrix, Test Plan, Systems Inventory, RACI, Timeline, and a Duplicate-Requirement report.

---

## AI (optional — turn on in Settings ⚙︎)

AI is **off** until you pick a provider. It's never required — everything except the AI-specific helpers works without it. Options:

1. **On-device browser AI (Auto)** — Chrome/Edge's built-in model (Gemini Nano), if available. Smallest and instant; no download, nothing leaves your machine.
2. **In-browser model (WebLLM)** — runs a real open model (Qwen2.5 / Llama 3.2) inside your browser via WebGPU. No API key, no install. First use downloads the model (~1–2 GB) and caches it; afterward it runs locally, even offline. Needs a recent Chrome/Edge with WebGPU. This is the browser-native equivalent of Ollama and works on a hosted (GitHub Pages) site.
3. **OpenAI-compatible / Ollama** — point it at an approved endpoint + key. Works with an open LLM provider **or an Ollama server on your internal network**, e.g. endpoint `http://your-server:11434/v1`, model `qwen2.5:3b`.
4. **Anthropic** — an approved Claude endpoint + key.

Keys are stored **only in this browser** and called directly from your machine.

> **Note:** Ollama itself can't run *on* GitHub Pages (or any static host) — it needs a server process. Option 2 (WebLLM) gives you the same "small local model" experience with no server, or use Option 3 to reach an Ollama server that runs elsewhere on your network.

---

## Supported file types

`.docx` (tables preserved) · `.xlsx` / `.xls` · `.csv` · `.txt` · `.md` · `.pdf`

---

## Project layout

```
index.html        The app — open this.
lib/              Document parsers: mammoth (.docx), SheetJS (.xlsx), pdf.js.
js/
  semantic.js     Rule-based NLP: decomposes a requirement into parts.
  generate.js     Builds test steps from that meaning.
  quality.js      Quality scoring + gap findings.
  extract.js      Requirements, sections, flow, scenarios, tests.
  elements.js     Universal extractors (objectives, scope, stakeholders, …).
  doctypes.js     Document-type classifier + per-type views.
  render.js       Document views (tabs) + shared helpers.
  store.js        The brain — persists in the browser (localStorage).
  llm.js          Pluggable AI: on-device model or approved cloud endpoint.
  brain.js        Builds the vault payload; brain API.
  graph.js        Obsidian-style brain graph.
  brain_ui.js     The 🧠 Brain view.
  compose.js      Compose documents from the brain.
  knowledge.js    Cross-references each document against the brain.
  flow.js         Persona swimlanes / process flow.
  ai.js           The ✨ AI Insights tab.
  qa.js           The ❓ Clarify (living-document) tab.
  projects.js     The 📁 Projects guided builder.
  app.js          Orchestration, adaptive tabs, file loading, wiring.
server.js         OPTIONAL local http server (needs Node) — not required.
```

No build step. It's plain HTML + vanilla JavaScript loaded with classic `<script>` tags, so you can open `index.html` directly or host the folder as-is.

---

## Privacy

Everything runs client-side. Documents are parsed in the browser, the brain lives in local storage, and nothing is uploaded. If you enable a cloud AI endpoint, only the text you send to that AI helper leaves your machine — and only to the endpoint you configured.

---

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security concern, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Mujtaba Mohammed
