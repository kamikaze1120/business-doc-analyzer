# Implementation Report — Architecture Hardening

Companion to `ARCHITECTURE_AUDIT.md`. Every claim here is backed by a code
change, a runtime reproduction, or a test. Work was done in six milestones
(M1 Observe → M6 Downstream automation) plus this wrap-up. All changes are
additive/behaviour-preserving unless a fix required otherwise, and nothing
marked NOT REPRODUCED in the audit was modified.

---

## 1. Confirmed issues (fixed)

### Issue 1 — Relationship direction mismatch (objective ↔ requirement)
- **Severity:** High (silently broke gap + health analysis).
- **Evidence:** agents created `implements` as `{from:FR, to:objective}` (`agents.js`), but `gaps.js` and `health.js` queried the objective's **downstream**. Runtime repro: objective's `upstream=['implements']`, `downstream=[]`; `objective_without_requirement` fired anyway and `health.objectivesWithReqs = 0/1`.
- **Affected files:** `js/gaps.js`, `js/health.js` (readers); root cause was the lack of a relationship contract.
- **Fix (M2):** added `js/relationships.js` — a registry with declared source/target types + inverse names and an **inverse-aware** `neighbors()` / `requirementsForObjective()`. `gaps.js` and `health.js` now resolve an objective's requirements in either stored direction.
- **Tests:** `relationships_test.js` (bug fixed + no false negative for a genuinely unlinked objective), `gaps_scope_test.js`.
- **Status:** FIXED.

### Issue 2 — Storage abstraction bypassed by the legacy Store
- **Severity:** Medium (blocked a clean storage migration).
- **Evidence:** `store.js:16,22,132,133` called `localStorage` directly, not `AppStorage`.
- **Fix (M2):** `store.js` persistence now routes through `AppStorage` (same key/shape) with a direct-`localStorage` fallback when the abstraction isn't loaded.
- **Tests:** `store_import_test.js` (exercises Store through `AppStorage` with a memory shim).
- **Status:** FIXED.

### Issue 3 — Project Truth Model had no export/import
- **Severity:** Medium (no portability/backup for canonical data).
- **Evidence:** `model.js` exposed no export/import; `store.js` export covered only the brain.
- **Fix (M3):** added `js/portability.js` — a versioned package (schemaVersion, project, objects, relationships, evidence + version-history inside objects, snapshots) with `exportProject` / `exportAllProjects` / `importProject`; wired Export/Import into the Analyst OS.
- **Tests:** `portability_test.js` (roundtrip, id-collision rename, snapshot restore, backup+recovery).
- **Status:** FIXED.

### Issue 4 — Weak, unvalidated brain import
- **Severity:** Medium (untrusted input).
- **Evidence:** `store.js` `importAll` did `if(!d.index||!d.notes) throw; db=d` — no schema version, no validation, wholesale overwrite.
- **Fix (M3):** `store.js` and `portability.js` treat imports as untrusted — safe JSON parse stripping `__proto__`/`constructor`/`prototype` (prototype-pollution guard), structural + schema-version validation, backup before overwrite (`restoreBackup`), structured errors, and (for the PTM) invalid relationships dropped rather than corrupting the graph. No imported content is executed.
- **Tests:** `store_import_test.js` (10), `portability_test.js` (21) — includes malicious `__proto__`, corrupted, old-schema, wrong-kind, unknown-type inputs.
- **Status:** FIXED.

### Additionally hardened (audit risks / tech debt, not defects)
- **Central mutation facade (Risk 1, M2):** `js/mutate.js` — update → version → impact → document-freshness → structured result; `agents.applyRewrite` and `questions.answerQuestion` route content changes through it. `mutate_test.js` (12).
- **Gap rule registry + scope-awareness (Debt 1, M4):** `gaps.js` refactored to a declarative registry; `project.meta.scope` suppresses out-of-scope rules and neutralizes their health impact. `gaps_scope_test.js` (11).
- **Conflict categories + dismiss lifecycle (M4):** added deterministic priority/status/date conflicts and a `dismissed` state that requires a reason and preserves evidence. `conflicts_categories_test.js` (8).
- **Layered duplicate detection (Phase 9, M4):** `js/duplicates.js` — exact / strong / possible layers with confidence + recommended action; explicit merge only. `duplicates_test.js` (11).
- **AI output schema validation (Debt 2, M5):** `js/aischema.js` — typed proposal schemas; `agents.js` validates every `llmJSON` result before any `addObject`. `aischema_test.js` (22), `agents_schema_test.js` (12).
- **Impact direct/indirect + paths, version-keyed freshness, traceability (Phase 5/15, M6):** `impact.js`, `factory.js`, `js/traceability.js`. `impact_paths_test.js` (8), `freshness_version_test.js` (9), `traceability_test.js` (6).

---

## 2. Not reproduced (investigated, left unchanged)

Confirmed already-correct in the audit and re-verified; no code changed:
AI content is never auto-approved (agents set `ai_proposed`/`ai_inference`; approved-object guard holds); provenance categories are distinct with per-object evidence; change-impact is cycle-safe (seen-set BFS); rollback preserves history (auto-backup before rollback); duplicate detection was already layered (exact + token/Jaccard). Details and evidence in `ARCHITECTURE_AUDIT.md §3`.

---

## 3. Architecture changes (before → after)

- **Before:** relationships were raw arrays traversed by ad-hoc direction; mutations scattered (only `Impact.applyChange` cascaded); PTM not portable; imports trusted; AI output shaped objects with inline defaults only; gaps/conflicts hardcoded; impact was a flat id list; freshness marked on any referenced change.
- **After:** a relationship **registry** validates edges and enables inverse-aware traversal; a **mutation facade** gives a consistent cascade + structured result; a **versioned import/export** package with untrusted-input validation; **typed AI schemas** gate every model write; **rule registries** (gaps) with scope-awareness and layered duplicate/conflict detection; **impact** labels direct/indirect with paths; **freshness** is keyed to source versions; **traceability coverage** is reported.
- **Backward compatibility:** all new modules degrade gracefully (guarded `root.X` / `typeof` checks) so Node tests and partial loads keep working; `store.js` keeps its classic global and gained a CommonJS export; existing gap `type` strings, conflict kinds, and `computeImpact.affected` fields are preserved, so the clarification engine, UI, and all prior tests are unaffected.

---

## 4. Data migration

- **Schema versions introduced:** PTM package `schemaVersion:1` (`portability.js`); brain export stamped `schemaVersion:1, kind:'bda-brain'` (`store.js`). The Project Truth Model store (`bda:truth:v1`) and snapshot store (`bda:truth:snap:v1`) were already versioned.
- **Migration logic:** existing legacy guided-builder projects continue to mirror into the PTM via `migrate.js` (idempotent, non-destructive, run on boot) — unchanged this milestone.
- **Rollback / recovery:** import backs up the current store to `bda:truth:backup:v1` / `bda:brain:backup:v1` before applying; `Portability.restoreBackup()` restores it. Object rollback and project snapshot rollback both record a new change rather than erasing history.
- **No user data is deleted** by any migration or import path.

---

## 5. Test results

- **Node engine suites:** 21 suites, **343 assertions, all passing.**
  `model(37) ingest(29) intel_gaps(18) conflicts_questions(21) impact_versioning(19) factory(17) health(12) agents_workflow(25) agents_ai(19) relationships(16) mutate(12) portability(21) store_import(10) gaps_scope(11) conflicts_categories(8) duplicates(11) aischema(22) agents_schema(12) impact_paths(8) freshness_version(9) traceability(6)`.
- **Browser/regression suites:** 12 suites, all passing with **zero console/page errors** — `browsertest, harness, serverless, knowledge, phase3, phase4, phase5, projects, proj_ui, ptm_ui, os_ui, agents_ui` (plus preset-UI and PTM-hook smoke tests).
- **AI tests use a stubbed llm** (valid / invalid / malformed structured output); **no test makes a live API call.**
- **Known limitations:** the test harnesses live in a working directory outside the repo (the repo ships the app only, matching its existing convention); browser tests run headless Chromium against `file://`. Deterministic engines are fully covered; the AI *provider transport* (real network calls to Groq/OpenRouter/Gemini/Ollama) is not exercised in CI — it is covered structurally by the OpenAI-compatible client and preset UI tests.

---

## 6. Remaining risks

| Risk | Impact | Likelihood | Recommended next step |
|---|---|---|---|
| Full-tree serialization per PTM read/write (`model.js db()`) | Slowdowns on very large projects | Medium at scale | Move to the `IndexedDBProvider` or per-project keys once project sizes warrant it (audit Risk 2). |
| Legacy Brain (Store) and PTM (Model) remain partially separate sources of truth | Data can diverge between the Document/Brain views and Analyst OS | Medium | Continue routing legacy write paths through the model, or formalize them as explicitly separate subsystems (audit §2). |
| AI provider preset model ids can drift as providers change their catalogs | A preset's default model may 404 until edited | Low | Fields are user-editable; revisit preset defaults periodically. |
| Semantic duplicate/conflict adjudication is deterministic (token/Jaccard) only | Some semantic duplicates/conflicts go undetected | Low–Medium | Optionally add an AI adjudication layer (audit Phase 9/10 Layer 4) behind the schema-validated agent path. |
| Cross-artifact links depend on agents/ingest creating edges | Traceability coverage understates when edges are absent | Medium | Encourage linking via the clarification queue; consider an AI relationship-proposal agent (schema-validated). |

---

*Prepared as part of the architecture-hardening mission. The Project Truth
Model is the canonical source of truth; documents are generated representations
of it; AI proposes and is validated, but never auto-approves.*
