# Supabase integration files

The app package now includes a first-party browser REST/Auth/Storage helper (`js/supabase-client.js`), runtime config (`js/supabase-config.js`), CSP allowance for this project, a database migration, an audited station/assignment migration, and a JWT-protected supervisor-provisioning Edge Function. No service-role key is bundled. The configured URL was derived from the project dashboard URL supplied by the user; the publishable key is browser-safe by design and is not an authorization boundary.

## Deploy backend

1. Install Supabase CLI and link this folder to project `ykeqphrqvrdxxrscujgu`.
2. Review and apply `migrations/001_core.sql`, then `migrations/002_audit_triggers.sql` using `supabase db push`.
3. Set Edge Function secrets on the project: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The service-role secret is only for server/Edge runtime; never add it to `js/supabase-config.js`, HTML, source control, or browser settings.
4. Deploy with `supabase functions deploy provision-supervisor`.
5. Bootstrap a `regions` row and the first Manager Auth user/profile through a trusted administrator procedure. Do not open public Manager registration. Configure Auth password policy, reset flow, rate limits, MFA, and redirect URLs.
6. Serve the app over HTTPS. For another Supabase project, replace both project URL/key in `js/supabase-config.js` and the exact project host in the `connect-src` Content Security Policy in `index.html`.

## Application integration boundary

The helper exports `window.SupabaseClient` methods for password sign-in with the tenant login alias, `profiles` REST queries, private bucket upload/download, token refresh, and sign-out. The current legacy application still uses its existing local IndexedDB identity/session/operational data paths; it does **not yet call this helper for its actual screens**. Do not regard the existing station workflow as cloud-synced or Supabase-authenticated until those pathways are migrated. The Supabase schema is relational and the old app is a large local aggregate, so a proper migration needs a deliberate record-by-record repository/API rewrite, not an unsafe whole-directory snapshot sync.

## Backend behavior and remaining security work

- Region-scoped Manager RLS, Supervisor station assignment reads, immutable submitted bank records, required receipt paths, private image storage policies, and atomic approval/rejection RPC are in the SQL migrations.
- Provisioning is handled server-side by `provision-supervisor`; it creates Auth identity, profile, assignment, and audit event with rollback on failure. The function returns the temporary password only by requiring the Manager to supply it; use an out-of-band secure handoff and a forced reset flow before production.
- `002_audit_triggers.sql` automatically records station/assignment mutations.
- Before production, implement and test first-login password change and recovery, config validation/activation in the database (not only client), upload-path size/MIME checks, deactivation/reassignment behavior, migrations for all operational record types, and browser-to-Supabase application integration. Run tests with two regions and several accounts to prove RLS isolation and no self-approval. This package is not production-ready until that integration and testing is complete.
