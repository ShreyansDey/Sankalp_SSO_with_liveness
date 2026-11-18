# api.md (names are final)

Base: `http://localhost:8000`. JSON unless stated. Errors: `{ "error": "short_code", "message": "plain words" }`.

## Auth and signup
| Method | Path | Body / query | Result |
|---|---|---|---|
| POST | `/auth/signup` | invite_token, name, password | creates user, returns next step `liveness` |
| POST | `/auth/login` | email, password | if no SSO session: `next: liveness`; else sets session |
| POST | `/auth/logout` | – | ends SSO session (never deletes account) |
| GET | `/me` | – | current user and status |

## Liveness
| POST | `/liveness/challenge` | – | challenge id, type, one-time code, expires_in 30 |
| POST | `/liveness/result` | challenge_id, code, passed (bool) | on pass: SSO session cookie set |

## SSO and tokens
| GET | `/authorize` | client_id, redirect_uri, state | has session → redirect with `code`; else → login page |
| POST | `/token` | grant_type=authorization_code, code, client_id, client_secret | access_token (10 min), refresh_token |
| POST | `/token/refresh` | refresh_token, client_id, client_secret | new access_token (fails if user not active) |
| GET | `/userinfo` | Bearer access token | id, name, email, role |

## Admin (role = admin)
| POST | `/admin/invites` | email, role, term_end | creates invite, returns link |
| GET | `/admin/users` | status? | list |
| POST | `/admin/users/{id}/mark-left` | – | status `disabled`, reason `left`, revoke sessions and tokens |
| POST | `/admin/users/{id}/disable` | reason | same revoke |
| POST | `/admin/users/{id}/enable` | – | back to `active` |
| POST | `/admin/users/{id}/delete-request` | – | only if disabled |
| POST | `/admin/users/{id}/delete-approve` | – | only if 30 days passed |
| POST | `/admin/products` | name, redirect_uri | returns client_id and secret (shown once) |
| GET | `/admin/audit` | limit | newest first |
| POST | `/admin/cleanup/run` | – | runs the cleanup job now (for the demo) |

## Rules
- Every protected route checks that the user is `active`. Disabled users get `403 account_disabled`.
- `/liveness/challenge` is rate limited: max 5 per 10 minutes per user.
- Auth codes are one-time and last 60 seconds. Redirect address must match the registered one exactly.
