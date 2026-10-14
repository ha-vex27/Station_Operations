# Phase 1 — Supabase Manager authentication

This phase changes the login screen to authenticate Manager credentials through Supabase Auth and load the matching `public.profiles` row. Failed cloud sign-in never falls back to the old local username/password check. It also adds a forced cloud-password update for profiles marked `must_change_password`.

## Important boundary

This is **not yet shared operational storage**. Station configuration, readings, deliveries, stock, deposits, local Supervisor users, and most audit activity still use this browser's IndexedDB. The application displays a warning after Supabase Manager sign-in. Do not use it for live financial operations or assume another device can see records until the later repository/data migration is complete. Supervisor cloud login is intentionally rejected in this phase.

## Deploy the new database function

From the project folder on Windows PowerShell:

```powershell
npx -y supabase@latest db push
```

The CLI should apply `004_self_password_change.sql`. If it reports that the project is not linked, run:

```powershell
npx -y supabase@latest link --project-ref tsbymtzijbwsxxxomrdo
npx -y supabase@latest db push
```

Do not run `db reset`; that can destroy database data.

## Publish the website changes

1. Replace the project files with this phase's files, preserving any unrelated repository files you have added.
2. Run the checks below from the project directory:

```powershell
node --check .\js\app.js
node --check .\js\supabase-client.js
node .\tests\smoke.test.js
```

3. Commit and push the changes to the GitHub branch your hosting provider deploys from. For example:

```powershell
git add index.html js/app.js js/supabase-client.js supabase/migrations/004_self_password_change.sql supabase/README.md PHASE-1-SUPABASE-AUTH.md
git commit -m "Connect Manager login to Supabase Auth"
git push
```

4. Wait for your hosting provider to finish deploying, then hard-refresh the site (`Ctrl+F5`).
5. Sign in with username `havex` and the current password for its Supabase Auth user. The email alias expected by the login helper is `havex@login.station-ops.invalid`.
6. If the profile has `must_change_password = true`, the app should require a new password. Otherwise it should open the Manager workspace and show the persistent warning that operational data is still local.

## Safe test results

- Valid Manager account: Supabase authenticates the user and the matching Manager profile is required.
- Invalid password or missing profile: sign-in is rejected; the app does not use local credentials as a fallback.
- Supervisor account: rejected with a message that Supervisor cloud login is not part of this phase.
- Forced password change: updates the Supabase Auth password and clears the user's own `must_change_password` flag using the new RPC.

If the sign-in request fails, open Chrome DevTools → Network, retry once, and share only the status code and response error message. Never share a password, bearer token, refresh token, or Authorization header.
