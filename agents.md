# agents.md — Rules for the AI assistant (and for us)

Project: **Real Person, Real Access** · Team **Sankalp** (Shreyans Dey, Arka Paul)
Event: Hack N Pitch, Jadavpur University E-Cell, 20–21 Nov 2026 · Track: Cybersecurity & Digital Identity

## 1. What we are building
A small, self-hosted SSO for colleges, clubs and small teams.
- **One login**: sign in once, open every connected product with one click.
- **A real person**: a short camera check (blink or head turn) proves a live person is present. Only pass or fail is stored.
- **Automatic cleanup**: access ends on its own (term expiry, inactivity, admin "mark as left").

Read these first, in this order: `srs.md` → `architecture.md` → `data-model.md` → `api.md` → `security.md` → `build-plan.md` → `todos.md`.

## 2. Stack (do not change without asking us)
Python 3 + FastAPI · PostgreSQL (SQLite allowed only for a quick local start) · SQLAlchemy · JWT (PyJWT) · React (Vite) · MediaPipe Face Mesh in the browser · Two tiny demo apps ("App A", "App B").

## 3. Working rules
1. Follow `build-plan.md` phase by phase. Do not start Phase 2 before the Phase 1 checkpoint passes.
2. Keep it simple. If a feature is not in `srs.md`, ask before adding it.
3. Names of tables, fields and endpoints come from `data-model.md` and `api.md`. Do not rename them. If a change is needed, update the doc first, then the code.
4. Never store face images or video. Never log passwords, tokens or codes.
5. Passwords are hashed (argon2 or bcrypt). Secrets come from environment variables, never from the code.
6. Small commits with clear messages. One feature per commit.
7. After finishing any task, tick it in `todos.md`.

## 4. Documentation rule (important)
**Every module gets its own markdown file** in `docs/modules/`, written as we build it, not at the end.
- File name: `NN-module-name.md` (for example `01-auth-core.md`). Start from `docs/_module-template.md`.
- Each file must contain: purpose, what it does in plain words, the **full code of the module** (or the key files), a line-by-line or block-by-block explanation, how to run or test it, and known limits.
- Write for a non-technical reader first (plain sentences), then the technical details.
- Keep `docs/modules/00-index.md` updated with one line per module and its status.
- A module is "done" only when its file exists and matches the code.

Modules expected: `01-auth-core`, `02-sso-flow`, `03-liveness`, `04-admin-dashboard`, `05-cleanup-job`, `06-audit-log`, `07-demo-apps`.

## 5. Definition of done (per module)
Code runs → checklist items in `test-checklist.md` pass → module doc written → `todos.md` ticked.

## 6. Honest limits (never overclaim)
The check stops photos and replays. Real-time deepfakes are future work. Liveness proves a live person, not which person. See `security.md`.

## 7. Style
Plain English in docs and UI text. Short sentences. No jargon without a one-line explanation.
