# srs.md — Software Requirements

## 1. Problem
Accounts of people who have left stay active, and passwords alone cannot show that a real person is present.
Example: Rahul left the photography club in June. In November, his login still works.

## 2. Users
- **Admin**: adds members, sets their end date, marks people as left, reviews the audit log.
- **Member**: signs up from an invite, passes the camera check, uses connected products.
- **Product (app)**: any app that trusts our login (demo: App A and App B).

## 3. Scope (what we build in 20 hours)
Must have (M):
- M1 Invite-based signup (admin invites, member sets password).
- M2 Login with email and password.
- M3 Liveness check at signup and at login when no SSO session exists.
- M4 SSO: central login, redirect with a one-time code, tokens for each product, one click into the second product.
- M5 Admin: "Mark as left" blocks all products at once.
- M6 Automatic cleanup: term end date and inactivity disable accounts.
- M7 Audit log of important actions.
- M8 Two demo apps showing Welcome / Access denied.

Should have (S): admin dashboard list with status, retry limit and rate limit on liveness, admin-approved fallback when the camera fails.
Could have (C): unusual-login flag (simple rule, e.g. new device or many failures).
Out of scope: face matching to a saved photo, mobile apps, real-time deepfake defence, multi-organization hosting.

## 4. Functional requirements
- FR1 Account states: `active`, `disabled`, `deleted`. Logout never deletes an account.
- FR2 Disabling revokes the SSO session and all refresh tokens immediately.
- FR3 Deleting needs: account already disabled, 30 days passed, and admin approval.
- FR4 Access tokens last 10 minutes. Refresh tokens are stored (hashed) and revocable.
- FR5 Liveness is a random challenge (blink or head turn) with a one-time code valid for 30 seconds. Only pass or fail is stored.
- FR6 Product registration: each product has a client id, secret and allowed redirect address.
- FR7 Every admin action and every login, denial and cleanup action is written to the audit log.
- FR8 A returning user with a live SSO session goes straight back to the product, with no second camera check.

## 5. Non-functional requirements
- Privacy: no face images or video leave the browser.
- Speed: login redirect under 2 seconds; product switch under 2 seconds.
- Simplicity: one command to start (docker or two terminals).
- Security: see `security.md`.

## 6. Success measures
Seconds from "mark as left" to denied access · fakes wrongly accepted · real users wrongly rejected · product switch under 2 seconds.

## 7. Known limits
Stops photos and replays. Real-time deepfakes are future work. Liveness shows a live person is there, not which person.
