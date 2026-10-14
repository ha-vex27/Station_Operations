# Implementation notes and verification

## Changes in the current pilot

- Bank deposits require an attached JPG, PNG, or WebP receipt image up to 8 MB. Camera capture is offered on supported devices; selecting an image is also supported.
- Receipt content is stored with the deposit and displayed in Manager review. Approval now explicitly fails when evidence is missing or is not a supported data-URI image.
- Banking records include station and supervisor identifiers.
- Manager can now edit station name and location, with uniqueness/length checks and an audit event. Historical transaction records are not rewritten by that identity change.
- Station readiness is computed from station identity/location, pump count, tank capacities, and positive Petrol/Diesel prices. The Manager station card displays Operational or Pending Configuration. Supervisor login is blocked while required setup is incomplete.
- Added smoke assertions in `tests/smoke.test.js`; JavaScript syntax check and smoke assertions pass.

## Supabase backend foundation

`supabase/migrations/001_core.sql` provides a Postgres/Supabase schema for region-separated Manager/Supervisor identities, stations, assignments, receipt-linked bank records, immutable submissions, private image storage, RLS, and an approval/rejection RPC. The RPC requires Manager role, rejects self-approval, requires a rejection reason, verifies a receipt object exists before approval, and records a decision audit event. `002_audit_triggers.sql` audits station/assignment changes, and `003_station_activation.sql` rejects activation of incomplete stations. A `provision-supervisor` Edge Function, browser Supabase client helpers/configuration, and a live-project test checklist are included.

## Not production-complete

The existing app is still a static, browser-local IndexedDB application. It is **not connected to Supabase**. The migration requires project-specific review and deployment; account provisioning, Auth invitation/password reset, profile bootstrap, station configuration validation, full administrative audit triggers, and the UI's end-to-end move from local storage to Supabase remain to be implemented. The SQL foundation is not a substitute for that integration or for RLS integration testing. Do not put a Supabase service-role key in browser code or use this static pilot as production financial control.
