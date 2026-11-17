# test-checklist.md

## SSO and tokens
- [ ] Signup from a valid invite works; an expired or used invite is refused
- [ ] Login with a wrong password fails and is logged
- [ ] App A → login → back with a token → Welcome
- [ ] App B opens with no form and no camera while the session is live
- [ ] A wrong `redirect_uri` is refused
- [ ] An auth code works once only and expires after 60 s
- [ ] An access token stops working after 10 minutes; refresh works for an active user

## Liveness
- [ ] A real person doing the action passes
- [ ] A printed photo fails
- [ ] A recorded video replayed later fails (code expired or used)
- [ ] Code older than 30 s is refused; a used code is refused
- [ ] More than 5 challenges in 10 minutes is refused
- [ ] Poor light: retry works

## Access removal and cleanup
- [ ] Mark as left: both apps show Access denied immediately; refresh token fails
- [ ] A disabled user cannot log in
- [ ] Logout keeps the account; logging in again needs the camera check
- [ ] Term end in the past: cleanup disables the user
- [ ] Inactive over the limit: cleanup disables the user
- [ ] Delete is refused before 30 days or without approval

## Audit and privacy
- [ ] Every action in `data-model.md` audit list appears in the log
- [ ] No passwords, tokens or codes in logs
- [ ] Database contains no face images or video

## Measures to report
- [ ] Seconds from mark-as-left to denied: ____
- [ ] Fakes wrongly accepted: ____ / ____
- [ ] Real users wrongly rejected: ____ / ____
- [ ] Product switch time: ____ s
