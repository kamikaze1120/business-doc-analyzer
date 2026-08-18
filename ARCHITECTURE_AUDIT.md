# Architecture Audit — business-doc-analyzer

**Method.** This audit is evidence-based. Every claim cites a file and line or a
runtime reproduction. Suspected issues from the review brief were each checked
against the current code; where an issue is not present it is recorded as
**NOT REPRODUCED** with the reason, and **no code is changed for it**. Findings
are categorized: `CONFIRMED ISSUE`, `NOT REPRODUCED`, `ARCHITECTURAL RISK`,
`TECHNICAL DEBT`.

Repository state at audit time: `main` @ `b750b33`.

---

## 1. Architecture map

The app is a single-page, no-build, vanilla-JS application loaded by classic
`<script>` tags in `index.html` (load order matters — the data layer loads
before the views). There is no server for core features; `server.js` is an
optional, unused-by-default local static host.

```
index.html (entry, all wiring)
  → app.js .............. orchestration, setMode(doc|projects|brain|os), file load
    → DOCUMENT ANALYSIS (transient in-memory STATE)
        semantic.js, generate.js, quality.js, extract.js, elements.js, doctypes.js,
        render.js, flow.js, knowledge.js, qa.js, ai.js
    → LEGACY BRAIN + GUIDED PROJECTS (persistent: Store, key bda:brain:v1)
        store.js, brain.js, graph.js, brain_ui.js, compose.js, projects.js
    → PROJECT TRUTH MODEL (persistent: Model, key bda:truth:v1)
        uid.js, storage.js, model.js, migrate.js, ingest.js, provenance.js,
        intelligence.js, gaps.js, conflicts.js, questions.js, impact.js,
        versioning.js (key bda:truth:snap:v1), factory.js, health.js,
        agents.js, workflow.js, osui.js
    → AI / LLM PROVIDERS (config: llm.js, key bda:ai)
```

### Module register

| Module | Responsibility | State ownership | Status |
|---|---|---|---|
| `app.js` | Pipeline, adaptive tabs, mode switching, boot, runs `Migrate.run()` | transient `STATE` | active |
| `semantic/generate/quality/extract/elements/doctypes.js` | Deterministic document analysis engine | none (pure) | active |
| `render/flow/knowledge/ai.js` | Document-view rendering | reads `STATE`/`Store` | active |
| `qa.js` | Clarify (living doc) Q&A | writes `Store` clarifications + `STATE` | active (legacy target) |
| `store.js` | **Legacy Brain** + **legacy guided projects** | `localStorage['bda:brain:v1']` | active (legacy) |
| `brain/graph/brain_ui/compose.js` | Brain graph, compose-from-brain | reads `Store` | active (legacy) |
| `projects.js` | Guided document builder | writes `Store.projects`, mirrors to `Model` on Generate | active (legacy + bridge) |
| `uid.js` | Immutable UUID identity | none | active |
| `storage.js` (`AppStorage`) | Storage abstraction: Local / Memory / IndexedDB | none | active (partially adopted) |
| `model.js` (`Model`) | **Project Truth Model**: objects, display ids, lifecycle, evidence, relationships, versioning | `AppStorage['bda:truth:v1']` | active (canonical) |
| `migrate.js` | One-way mirror of legacy guided projects → Model | writes `Model` | active |
| `ingest.js` | Analysis `STATE` → Model objects + evidence + edges | writes `Model` | active |
| `provenance.js` | Trust/status/origin badges + evidence panel | none | active |
| `intelligence.js` | Requirement quality scoring | none | active |
| `gaps.js` | Multi-layer gap detection | reads `Model` | active |
| `conflicts.js` | Conflict/duplicate detection + lifecycle | reads/writes `Model` | active |
| `questions.js` | Prioritized clarification queue + answer write-back | writes `Model` | active |
| `impact.js` | Change-impact + document freshness | writes `Model` | active |
| `versioning.js` | Project snapshots, diff, rollback | `AppStorage['bda:truth:snap:v1']` | active |
| `factory.js` | Document Factory (generate from Model) | writes `Model` | active |
| `health.js` | Explainable readiness score | reads `Model` | active |
| `agents.js` | Specialized BA agents (deterministic + AI) | writes `Model` | active |
| `workflow.js` | Autonomous BA workflow orchestration | writes `Model` | active |
| `osui.js` | Analyst OS workspace UI | reads/writes `Model` | active |
| `llm.js` (`AI`) | Pluggable LLM providers | `localStorage['bda:ai']` | active |
| `server.js` | Optional local static host | n/a | unused by default |

---

## 2. Sources of truth (Phase 1)

**Finding: MULTIPLE persistent state containers exist — CONFIRMED, by design, partially bridged.**

| Source | Key | Owns | Written by | Read by |
|---|---|---|---|---|
| A. Legacy Brain / Guided Projects (`Store`) | `bda:brain:v1` | brain index/nodes/edges/notes, clarifications, per-doc entities, **guided projects** | `brain.js`, `qa.js`, `projects.js` | brain UI, compose, projects |
| B. Project Truth Model (`Model`) | `bda:truth:v1` | canonical objects/relationships/evidence/versions | `migrate`, `ingest`, `questions`, `conflicts`, `impact`, `factory`, `agents`, `osui` | Analyst OS + all engines |
| C. Snapshots (`Versioning`) | `bda:truth:snap:v1` | point-in-time PTM baselines | `versioning.js` | versioning |
| D. Transient analysis (`STATE`, app.js) | in-memory only | current document analysis | `analyze()` | document views, `ingest` |
| E. AI config (`llm.js`) | `bda:ai` | provider/endpoint/key/model | Settings | `llm.js` |

**Synchronization** is **one-way, event-triggered, and partial**:
- `migrate.js` mirrors legacy guided projects (A) → PTM (B) idempotently on boot (`app.js` calls `Migrate.run()`).
- `projects.js` "Generate & analyze" and `ingest.js` mirror analysis (D) → PTM (B).
- There is **no** B→A sync, and the Document Analyzer, Brain, and Clarify features still write to A (`Store`), not B. So A and B can diverge: editing a requirement in Analyst OS (B) does not update the brain note (A), and answering a Clarify question (A) does not update the PTM (B).

This matches the review brief's "Multiple Independent Sources of Truth." The
canonical model (B) is clearly defined and is the intended source of truth, but
adoption is incomplete. The **controlled migration layer already exists**
(`migrate.js`, `ingest.js`); the remaining work is to route the legacy write
paths through the model or keep them explicitly as separate, documented
subsystems. This is tracked below as ARCHITECTURAL RISK, not a defect to rip out.

---

## 3. Findings register

### CONFIRMED ISSUE 1 — Relationship direction mismatch (objective ↔ requirement)
- **Severity:** High (silently breaks gap + health analysis).
- **Evidence (code):** `agents.js:91,95` create the edge `addRelationship(FR.id, objective.id, 'implements')` → stored as `{from:FR, to:objective}`. `gaps.js:52` and `health.js:38` test the objective's **downstream** (`relationshipsOf(objective).downstream`, i.e. edges where `from===objective`) for a requirement target.
- **Evidence (runtime):** with one objective + one FR linked by `implements`, the objective's `upstream=['implements']`, `downstream=[]`; `objective_without_requirement` **fires anyway**, and `health.objectivesWithReqs = 0/1`.
- **Root cause:** relationship traversal assumes a direction that the creating code does not use; there is no canonical relationship contract or inverse-aware traversal helper.
- **Planned fix (Milestone 2):** introduce a relationship registry with declared source/target types and inverse semantics, plus an inverse-aware traversal helper; fix the objective→requirement queries in `gaps.js` and `health.js` to use it. Add regression tests (forward + inverse traversal).

### CONFIRMED ISSUE 2 — Storage abstraction bypassed by the legacy Store
- **Severity:** Medium (architectural; blocks a clean IndexedDB/remote migration).
- **Evidence:** `store.js:16,22,132,133` call `localStorage.getItem/setItem/removeItem` **directly**, not through `AppStorage`. By contrast `model.js` and `versioning.js` use `AppStorage`.
- **Root cause:** `store.js` predates the storage abstraction and was never migrated.
- **Planned fix (Milestone 2):** route `store.js` persistence through `AppStorage` (same key/shape, so existing brains still load), keeping the deterministic fallback to memory when storage is blocked.

### CONFIRMED ISSUE 3 — The Project Truth Model has no export/import
- **Severity:** Medium (data portability + the review brief's Phase 14 package).
- **Evidence:** `model.js` exposes no `exportAll`/`importAll` (only `module.exports` at `:246`). `store.js:130-131` `exportAll`/`importAll` cover **only** the brain (`index`/`notes`), not PTM objects/relationships/evidence/versions. So a user cannot back up or move a Truth-Model project.
- **Planned fix (Milestone 3):** add a versioned PTM project package (schema version, project, objects, relationships, evidence, snapshots) with validation on import.

### CONFIRMED ISSUE 4 — Weak, unvalidated import (brain)
- **Severity:** Medium (untrusted input; Phase 14/20).
- **Evidence:** `store.js:131` `importAll` only checks `if(!d.index||!d.notes) throw 0;` then `db=d` — a wholesale overwrite with no schema version, no object-type/relationship validation, no id-collision handling, and no backup/rollback.
- **Planned fix (Milestone 3):** schema + version validation, treat as untrusted, back up current state before applying, and report structured errors.

### ARCHITECTURAL RISK 1 — Mutation logic is not centralized
- **Evidence:** impact/freshness cascade lives only in `impact.js:applyChange`. Other write paths mutate the model without cascading: `questions.js:answerQuestion` (uses `Model.updateObject`/`addEvidence`), `conflicts.js:setConflictStatus`, `osui.js` accept/reject (`Model.setStatus`), `factory.js` (`Model.updateObject`). So a requirement edited via one path recomputes downstream impact and document freshness; via another it does not.
- **Note:** `Model.updateObject` **does** consistently record version history and enforce the approved-object guard (verified in `model.js`), so history/approval are centralized; **impact/freshness/health are not**.
- **Planned fix (Milestone 2/6):** a thin mutation facade that wraps update → version → impact → freshness → returns a structured result, and route the key PTM write paths through it. Prefer the simplest consistent pipeline (no event sourcing).

### ARCHITECTURAL RISK 2 — Full-tree serialization on every model read/write
- **Evidence:** `model.js` `db()` calls `AppStorage.getJSON(KEY)` (parse the entire truth store) on **every** read, and `persist()` serializes the whole tree on every write. For large projects this is O(n) per operation.
- **Planned fix:** evaluate after correctness milestones; a per-project or IndexedDB-backed provider is the path if data volume warrants. Not urgent at current scale; do not migrate blindly (Phase 13).

### TECHNICAL DEBT 1 — Detection engines are hardcoded, not rule registries
- **Evidence:** `gaps.js` and `conflicts.js` encode rules inline. The brief's Phase 10/11 ask for a rule registry (id, applies-to, severity, explanation, recommended action) and scope-awareness (don't penalize out-of-scope artifacts).
- **Planned fix (Milestone 4):** extract a rule registry; add project-scope flags so e.g. "missing test cases" is not penalized when the project declares testing out of scope. Add conflict categories currently absent (date/timeline, priority, status) and the `dismissed` lifecycle state with a required reason.

### TECHNICAL DEBT 2 — AI output is not schema-validated
- **Evidence:** `agents.js` consumes `llmJSON(...)` and constructs objects with defensive defaults (`String(x).slice(...)`, `REQ_MAP[...]||'functional_requirement'`) and a similarity dedupe, but there is **no explicit schema validation/rejection** with diagnostics before mutating the model.
- **Planned fix (Milestone 5):** typed proposal schemas (RequirementProposal, AcceptanceCriteriaProposal, TestCaseProposal, DiscoveryItem, …) validated before any `addObject`; on failure, reject + capture diagnostics (no secrets) rather than write partial data.

### Suspected issues — NOT REPRODUCED

- **"AI-generated content is treated as approved fact."** NOT REPRODUCED. Evidence: `agents.js` `proposeAI`/`proposeDet` set `status:'ai_proposed'`, `provenance:'ai_inference'`; `model.js` `updateObject` blocks substantive edits to `approved` objects unless forced; `workflow.js` never calls `approve`. Tested by `agents_workflow_test.js` / `agents_ai_test.js` ("never auto-approves").
- **"Provenance collapses categories into one generic source."** NOT REPRODUCED. Evidence: `model.js` `PROVENANCE` enum (`fact`, `stakeholder_statement`, `ai_inference`, `assumption`, `open_question`, `conflict`), per-object `evidence[]` with `extractionMethod`/`confidence`/`location`, and `provenance.js` distinct badges. Locations are recorded only when known (`ingest.js` sets `{line}` from the parser; no page/paragraph fabricated).
- **"Approved objects can be silently overwritten."** NOT REPRODUCED. Evidence: `model.js` `updateObject` returns `{blocked:true}` for substantive edits to approved objects unless `opts.force`; `reviseApproved` is the explicit, reason-carrying path. Tested in `model_test.js`.
- **"Change-impact can infinite-loop on cycles."** NOT REPRODUCED. Evidence: `impact.js` `downstreamClosure` uses a `seen` Set BFS, so cycles terminate and results are de-duplicated. (Gap: it does not yet label direct-vs-indirect or explain the path — tracked as a Milestone 6 enhancement, not a defect.)
- **"Rollback erases history."** NOT REPRODUCED. Evidence: `versioning.js` `rollbackToSnapshot` takes an `auto-backup before rollback` snapshot first; `model.js` `rollbackObject` applies via `updateObject` (records a new version). Tested in `impact_versioning_test.js`.
- **"Duplicate detection is exact-match only."** NOT REPRODUCED (partially). Evidence: `ingest.js` `findSimilar` and `conflicts.js` use normalized equality **plus** Jaccard token overlap (threshold 0.82). Layer 3 (embeddings) and Layer 4 (AI adjudication) are absent — tracked as enhancement, not a defect.

---

## 4. Milestone plan (implementation order)

1. **M1 — Observe (this document).** Evidence-based audit; confirmed vs not-reproduced.
2. **M2 — Stabilize the core.** Relationship registry + inverse-aware traversal; fix Confirmed #1 in `gaps.js`/`health.js`; route `store.js` through `AppStorage` (Confirmed #2); introduce the mutation facade (Risk 1).
3. **M3 — Data integrity.** PTM export/import package + import validation (Confirmed #3, #4); provenance/versioning `by`/`source` enrichment.
4. **M4 — Analysis intelligence.** Gap/conflict rule registries + scope-awareness; added conflict categories + `dismissed` lifecycle (Debt 1).
5. **M5 — AI hardening.** Typed AI proposal schemas + validation/rejection (Debt 2); optional AI adjudication layer for duplicate/conflict.
6. **M6 — Downstream automation.** Impact direct-vs-indirect labelling + path explanation; document freshness via source **versions**; cross-artifact traceability.
7. **Out-of-the-box AI.** Ship provider **presets** for zero-config free tiers (user pastes their own free key). A live shared API key will **not** be committed to a public repo — that is an API-key-exposure anti-pattern (Phase 20) and any such key is scraped and revoked within hours; the honest "works after a 30-second signup" path is presets + guidance, verified only to the extent the sandbox network allows.

Each milestone adds regression tests and is verified (Node engine suites + full
browser regression, zero console errors) before it is pushed. Results are
recorded in `IMPLEMENTATION_REPORT.md`.
