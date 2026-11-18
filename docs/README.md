# 📚 Sankalp SSO Documentation Hub

Welcome to the documentation repository for **Sankalp SSO ("Real Person, Real Access")**.

---

## 📑 1. System Specifications (`docs/specs/`)

The core architecture, requirements, and project plans:

1. [**SRS (Software Requirements Specification)**](file:///docs/specs/srs.md): Functional and non-functional requirements (M1–M8, FR1–FR7).
2. [**Architecture**](file:///docs/specs/architecture.md): Component diagrams, OAuth 2.0 flow, and token lifecycles.
3. [**Data Model**](file:///docs/specs/data-model.md): PostgreSQL table schemas and audit event definitions.
4. [**API Reference**](file:///docs/specs/api.md): Complete list of REST, SSO, and Liveness endpoints.
5. [**Security & Privacy**](file:///docs/specs/security.md): Threat model, anti-spoofing limits, and privacy guarantees.
6. [**Build Plan**](file:///docs/specs/build-plan.md): Phase-by-phase implementation schedule.
7. [**Stack and Setup**](file:///docs/specs/stack-and-setup.md): Environment prerequisites and installation instructions.
8. [**Demo Presentation Script**](file:///docs/specs/demo-script.md): 4-minute demo walkthrough for judges.
9. [**Test Checklist**](file:///docs/specs/test-checklist.md): Comprehensive pre-flight test checklist.
10. [**Todos**](file:///docs/specs/todos.md): Milestone checklist and completion status.

---

## 🛠️ 2. Module Implementations (`docs/modules/`)

Every module includes its complete source code, layman explanation, and step-by-step technical breakdown:

- [**00 — Module Index**](file:///docs/modules/00-index.md): Summary table of all modules.
- [**01 — Auth Core**](file:///docs/modules/01-auth-core.md): Signup, invite tokens, Argon2 hashing, and sessions.
- [**02 — SSO Flow**](file:///docs/modules/02-sso-flow.md): OAuth 2.0 authorization code exchange and JWT handling.
- [**03 — Liveness Check**](file:///docs/modules/03-liveness.md): MediaPipe Face Mesh, Eye Aspect Ratio, and 30s challenge codes.
- [**04 — Admin Dashboard**](file:///docs/modules/04-admin-dashboard.md): Member management, instant access termination, and invites.
- [**05 — Cleanup Job**](file:///docs/modules/05-cleanup-job.md): Automated APScheduler lifecycle expiry and inactivity cleaner.
- [**06 — Audit Log**](file:///docs/modules/06-audit-log.md): Tamper-evident security trail.
- [**07 — Demo Apps**](file:///docs/modules/07-demo-apps.md): 5 connected university campus clubs (ports 5174–5178).
