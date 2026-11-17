# demo-script.md — about 4 minutes

**Opening (20 s):** "Rahul left the photography club in June. In November, his login still works. Passwords alone cannot show a real person is there, and nobody removes old accounts."

**Step 1 — Sign in once (45 s):** Open App A. It sends us to the central login. Enter email and password. Do the camera check: "blink twice". Welcome.
Say: "Only pass or fail is stored. The video stays in this browser."

**Step 2 — One click (30 s):** Open App B. No form, no camera. Welcome.
Say: "That is the one-click part."

**Step 3 — Show the photo fails (30 s):** Try the check with a printed photo. It fails.
Say: "It stops photos and replays."

**Step 4 — Rahul leaves (45 s):** Admin dashboard → "Mark as left" for Rahul. Go back to both apps and refresh: Access denied in both, at once.
Say: "Rahul's access leaves with him."

**Step 5 — Automatic cleanup (30 s):** Click "Run cleanup now". An expired member is disabled. Show the audit log line.

**Close (30 s):** "Not the first, but built for small teams: self-hosted, private by design, cleanup built in. Honest limit: real-time deepfakes are future work."

## Likely judge questions
- **How is this different from Okta or Ping?** Those are built for larger organizations and often vendor-hosted. Ours is self-hosted, small-team, with cleanup built in.
- **Where does the face video go?** Nowhere. It stays in the browser; we store pass or fail only.
- **Can a deepfake beat it?** Not a printed photo or a replay. Real-time deepfakes are future work.
- **What if the camera fails?** Retries, then an admin-approved fallback.
- **What happens on logout?** The session ends; the account stays. Logging in again needs the camera check.
- **How do you decide when to delete someone?** Disable first, wait 30 days, admin approves.
- **How will you measure success?** Seconds from removal to denied access, fakes wrongly accepted, real users wrongly rejected, product switch under 2 seconds.

## If something breaks on stage
Have a 60-second screen recording of the full flow ready as a backup, and the slides open.
