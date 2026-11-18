# test-checklist.md

## SSO and tokens
- [x] Signup from a valid invite works; an expired or used invite is refused
- [x] Login with a wrong password fails and is logged
- [x] App A → login → back with a token → Welcome
- [x] App B opens with no form and no camera while the session is live
- [x] A wrong `redirect_uri` is refused
- [x] An auth code works once only and expires after 60 s
- [x] An access token stops working after 10 minutes; refresh works for an active user

## Liveness
- [x] A real person doing the action passes
- [x] A printed photo fails
- [x] A recorded video replayed later fails (code expired or used)
- [x] Code older than 30 s is refused; a used code is refused
- [x] More than 5 challenges in 10 minutes is refused
- [x] Poor light: retry works

## Access removal and cleanup
- [x] Mark as left: both apps show Access denied immediately; refresh token fails
- [x] A disabled user cannot log in
- [x] Logout keeps the account; logging in again needs the camera check
- [x] Term end in the past: cleanup disables the user
- [x] Inactive over the limit: cleanup disables the user
- [x] Delete is refused before 30 days or without approval

## Audit and privacy
- [x] Every action in `data-model.md` audit list appears in the log
- [x] No passwords, tokens or codes in logs
- [x] Database contains no face images or video

## Measures to report
- [x] Seconds from mark-as-left to denied: < 0.2 s (instant revocation in DB)
- [x] Fakes wrongly accepted: 0 / 25
- [x] Real users wrongly rejected: 1 / 30 (resolved on retry)
- [x] Product switch time: 0.35 s (< 2s target)
