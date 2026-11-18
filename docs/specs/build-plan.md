# build-plan.md — about 20 hours, 2 people

Split: **Shaan** = backend (auth, SSO, tokens, cleanup). **Arka** = front-end (login, liveness screen, admin, demo apps). Meet at each checkpoint.

## Hour 0–1: Setup
Repo, folders, environment, database up, "hello" route and page. Register App A and App B in the database. (`stack-and-setup.md`)

## Phase 1 (hours 1–7): Core login and instant removal
Backend: users, invites, signup, login, sessions, `/authorize`, `/token`, `/token/refresh`, `/userinfo`, mark-left with revoke, audit log basics.
Front-end: login page, redirect handling, two demo apps, minimal admin list with "Mark as left".
**Checkpoint 1:** one login opens both apps; marking as left blocks both. Write modules 01, 02, 07.

## Phase 2 (hours 7–13): Liveness check
Challenge and result endpoints, one-time codes, rate limit. MediaPipe in the browser: blink and head-turn detection, on-screen prompt, countdown. Retry and admin-approved fallback.
**Checkpoint 2:** a real person passes; a printed photo fails. Write module 03.

## Phase 3 (hours 13–17): Automation and audit log
Cleanup job (term end, inactivity), run-now button, full audit screen, delete rules (disable first, 30 days, approval).
**Checkpoint 3:** expired test user is disabled automatically; audit shows it. Write modules 04, 05, 06.

## Hours 17–20: Polish and demo
Seed demo data (Rahul), rehearse `demo-script.md` twice, fix rough edges, finish docs, tick `test-checklist.md`.

## Cut list (cut in this order if time is short)
1. Unusual-login flag 2. Admin-approved fallback UI (keep as a manual database step) 3. Delete approval flow (keep disable) 4. Audit screen polish (keep the list)
**Never cut:** SSO flow, liveness check, mark as left, the demo.

## Risks
Camera/light problems at the venue → test early, keep retries. Wi-Fi → everything runs locally. MediaPipe model download → cache it locally before the event.
