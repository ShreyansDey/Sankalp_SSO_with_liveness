# todos.md

## Before the event (documents and preparation, no code)
- [ ] Check Jadavpur rules: is pre-written code allowed? team size, laptops, power, Wi-Fi
- [ ] Read all docs once, both of us; fix anything unclear
- [ ] Decide who does backend and who does front-end
- [ ] Install tools on both laptops (see `stack-and-setup.md`)
- [ ] Download MediaPipe model files so they work offline
- [ ] Test both laptops' webcams
- [ ] Rehearse the demo story out loud once

## Hour 0–1 Setup
- [ ] Repo and folders · [ ] database running · [ ] hello route and page · [ ] App A and App B registered

## Phase 1 — Core login and instant removal
- [ ] users, invites, products tables
- [ ] signup from invite · [ ] login · [ ] SSO session cookie
- [ ] `/authorize`, `/token`, `/token/refresh`, `/userinfo`
- [ ] login page and redirect handling · [ ] demo App A and App B
- [ ] admin list and "Mark as left" with revoke
- [ ] basic audit log
- [ ] **Checkpoint 1** · [ ] docs 01, 02, 07

## Phase 2 — Liveness
- [ ] challenge and result endpoints · [ ] one-time code, 30 s expiry · [ ] rate limit
- [ ] MediaPipe blink detection · [ ] head-turn detection · [ ] prompt and countdown screen
- [ ] retries · [ ] admin-approved fallback
- [ ] **Checkpoint 2** · [ ] doc 03

## Phase 3 — Automation and audit
- [ ] cleanup job (term end, inactivity) · [ ] run-now button
- [ ] delete rules (30 days, approval) · [ ] audit screen
- [ ] **Checkpoint 3** · [ ] docs 04, 05, 06

## Final
- [ ] seed demo data · [ ] rehearse twice · [ ] `test-checklist.md` all ticked · [ ] `docs/modules/00-index.md` complete
