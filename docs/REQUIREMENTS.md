# Support Portal Modernization: Requirement Document (Simulated)

## 1. Project overview
| Item | Detail |
|---|---|
| Project | Support Portal Modernization (simulated) |
| Client | "Acme Services Pvt. Ltd." (fictional) |
| Existing system | Basic ticket portal, no SLA tracking, manual follow-up |
| Goal | Add SLA tracking, automatic reminders, reliable emails, manager visibility |
| Constraint | Existing ticket functionality must not break |

## 2. Business problem
1. No way to track when first response is due for a ticket.
2. Managers cannot see overdue tickets.
3. Email notifications are unreliable (sometimes duplicate, sometimes missed).
4. No audit trail of who changed what.

## 3. Roles and permissions
| Action | Admin | Manager | Agent |
|---|---|---|---|
| User create/disable | Yes | No | No |
| Ticket create | Yes | Yes | Yes |
| Ticket assign / reassign | Yes | Yes | No |
| Ticket update (status, notes) | Yes | Yes | Own tickets only |
| Ticket delete | Yes | No | No |
| Analytics dashboard | Yes | Yes | No |
| Audit logs view | Yes | Yes (read only) | No |

## 4. SLA rules (sample business rules)
| Priority | First-response target |
|---|---|
| Critical | 30 minutes |
| High | 2 hours |
| Medium | 8 hours |
| Low | 24 hours |

### Assumptions
- A1: SLA clock starts at ticket creation time.
- A2: First response = assigned agent's first public reply or status update.
- A3: Phase 1 uses a 24x7 calendar (business-hours calendar is a later enhancement).
- A4: Status values: ON_TRACK (<75% of time used), AT_RISK (75-100%), BREACHED (>100% with no response), MET (responded in time).
- A5: When priority changes, the SLA deadline is recalculated and the change is audit-logged.
- A6: All times stored in UTC, displayed in local time in the UI.

## 5. Functional requirements
- FR-1 JWT login, role-based access (Admin/Manager/Agent).
- FR-2 Ticket CRUD, assignment, status flow: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED.
- FR-3 Priority-based SLA deadline auto-calculation.
- FR-4 SLA status tracking (rules in A4).
- FR-5 Reminder notifications (at-risk and breach), duplicate-safe: one email per ticket per event.
- FR-6 Manager analytics: overdue count, breach rate, tickets by priority/status, agent workload.
- FR-7 Audit logs: who, what, when, old/new value.
- FR-8 Server-side validation, pagination, filtering.
- FR-9 Safe migration strategy for existing data.

## 6. Non-functional requirements
- Secrets only in .env, never committed to Git.
- Passwords hashed with bcrypt.
- Target API response time under 500 ms at normal load.
- Responsive UI (desktop, tablet, mobile).
- Unit and integration tests.
- Staging deployment.

## 7. Acceptance criteria (Given / When / Then)
- AC-1 Auth: Given valid Agent credentials, when they log in, then a JWT is issued. When the Agent opens the analytics API, then 403 is returned.
- AC-2 SLA calculation: Given a Critical ticket created at 10:00, then slaDueAt is 10:30.
- AC-3 SLA status: Given a High ticket 1h30m old with no response, then status is AT_RISK. At 2h15m with no response, status is BREACHED.
- AC-4 Met: Given an agent replies within SLA time, then status is MET and no breach reminder is sent.
- AC-5 Duplicate-safe: Given the scheduler runs 5 times, then only one breach email is sent per ticket.
- AC-6 Dashboard: Given a manager logs in, then overdue ticket count and breach percentage are visible.
- AC-7 Audit: Given a ticket is assigned, then the audit log holds actor, old assignee, new assignee and timestamp.
- AC-8 Validation: Given a ticket without a title, when created, then 400 with a clear error message is returned.
- AC-9 Pagination: Given /api/tickets?page=2&limit=10, then the correct slice and total count are returned.
- AC-10 Security: The repository has no .env file, only .env.example.

## 8. Out of scope (first release)
Business-hours SLA, customer-facing portal, file attachments, chat, SMS.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Duplicate emails | Notification log with unique index |
| Scheduler misses a run after restart | Idempotent job based on DB state |
| Existing data schema mismatch | Migration script plus backup |
