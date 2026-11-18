# todos.md

## Before the event (documents and preparation, no code)
- [x] Check Jadavpur rules: is pre-written code allowed? team size, laptops, power, Wi-Fi
- [x] Read all docs once, both of us; fix anything unclear
- [x] Decide who does backend and who does front-end
- [x] Install tools on both laptops (see `stack-and-setup.md`)
- [x] Download MediaPipe model files so they work offline
- [x] Test both laptops' webcams
- [x] Rehearse the demo story out loud once

## Hour 0–1 Setup
- [x] Repo and folders · [x] database running · [x] hello route and page · [x] App A and App B registered

## Phase 1 — Core login and instant removal
- [x] users, invites, products tables
- [x] signup from invite · [x] login · [x] SSO session cookie
- [x] `/authorize`, `/token`, `/token/refresh`, `/userinfo`
- [x] login page and redirect handling · [x] demo App A and App B
- [x] admin list and "Mark as left" with revoke
- [x] basic audit log
- [x] **Checkpoint 1** · [x] docs 01, 02, 07

## Phase 2 — Liveness
- [x] challenge and result endpoints · [x] one-time code, 30 s expiry · [x] rate limit
- [x] MediaPipe blink detection · [x] head-turn detection · [x] prompt and countdown screen
- [x] retries · [x] admin-approved fallback
- [x] **Checkpoint 2** · [x] doc 03

## Phase 3 — Automation and audit
- [x] cleanup job (term end, inactivity) · [x] run-now button
- [x] delete rules (30 days, approval) · [x] audit screen
- [x] **Checkpoint 3** · [x] docs 04, 05, 06

## Final
- [x] seed demo data · [x] rehearse twice · [x] `test-checklist.md` all ticked · [x] `docs/modules/00-index.md` complete
