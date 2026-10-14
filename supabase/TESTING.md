# Required pre-production Supabase verification

Run only against a disposable Supabase project with seeded test users from two different regions. Do not use production data.

## Checklist

- [ ] Anonymous requests cannot select profiles, stations, assignments, transactions, audit, or objects.
- [ ] Supervisor A can select only assigned station data and cannot enumerate Region B.
- [ ] Supervisor cannot assign themselves, provision accounts, change role, alter another station, or insert a bank row for an unassigned/non-operational station.
- [ ] Receipt upload accepts JPEG/PNG/WebP within 8 MB and is denied for other MIME types, oversized files, wrong station path, or unassigned station.
- [ ] A banking row without a receipt object is not approvable. Direct update/delete of a submitted row is denied.
- [ ] Manager can inspect pending submissions only in their region; approval works once, writes audit, and second approval fails.
- [ ] A Supervisor cannot invoke the Manager decision RPC or approve their own submission. Rejection without reason fails; rejection with reason is audited.
- [ ] Reassigning a Supervisor revokes the previous station immediately; old transactions remain attributed to old station/supervisor.
- [ ] An incomplete station cannot be set operational by direct REST update or RPC; valid configuration can be activated only by its regional Manager.
- [ ] Supervisor provisioning rolls back Auth/profile/assignment on errors and writes actor-attributed audit events.
- [ ] Password reset, first-login password change, session expiry, MFA policy, and account recovery work end-to-end.

`tests/smoke.test.js` is only a local source-level check. It is not a substitute for this live RLS/API test matrix.
