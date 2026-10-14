# Deploying Station Operations for the pilot

The app is a static website: HTML, CSS, JavaScript, fonts and images. It needs no server code, database server or build step. Upload the files to any web host that serves them over **HTTPS**.

## What to upload

Upload the contents of the deployment package (`station-operations-pilot.zip`, unzipped):

```text
index.html        the app
404.html          sends mistyped links back to the app
css/styles.css    styles
js/app.js         application
assets/           fonts and images
DEPLOY.md         this guide (harmless to upload; you may leave it out)
```

`index.html` must sit at the top level of the site or folder you publish. Do **not** upload the source package's `tests/` folder.

## Before you start: choose the final address

Each browser keeps the records **per address** (protocol + domain + path). If the address changes later, for example from `something.netlify.app` to `ops.yourcompany.com`, the browser opens an empty system at the new address. You would then have to move the data with a full backup and restore.

Pick the address you will keep **before** the Manager's first sign-in.

## Option A: Netlify Drop (fastest; about 5 minutes)

1. Create a free account at <https://app.netlify.com/signup> and sign in.
   - Sign in **first**. Sites dropped without an account are deleted within an hour unless claimed.
2. Open <https://app.netlify.com/drop>.
3. Drag the **unzipped folder** (the one containing `index.html`) onto the page.
4. After a few seconds Netlify shows a live address such as `https://random-name-123.netlify.app`, with HTTPS already enabled.
5. Rename it: **Site configuration → Change site name** (for example `asante-ops` gives `https://asante-ops.netlify.app`). Do this **before** setup, for the reason above.
6. Optional: add your own domain under **Domain management**. Netlify issues the HTTPS certificate automatically.

**Updating later:** open the site in Netlify → **Deploys** → drag the new folder onto the deploy area. The address stays the same, so every device keeps its records.

## Option B: GitHub Pages (free, version-controlled)

1. Create a GitHub account and a **new repository**, for example `station-ops`.
   - On a free plan, Pages needs a **public** repository.
   - The app code becomes public, but **no station data**: records live only in each browser.
2. Upload the files: **Add file → Upload files**, drag in the contents of the unzipped folder (so `index.html` is at the repository root), then **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. After 1–2 minutes the site is live at `https://<your-user>.github.io/station-ops/`. Tick **Enforce HTTPS** if it is offered.
5. **Edit `404.html`, because this address is a sub-folder.** Replace the three `/` paths with the folder path, `/station-ops/`; the comment inside the file shows where. If you use a custom domain at the root (Settings → Pages → Custom domain), leave `404.html` unchanged.

**Updating later:** upload the new files over the old ones and commit. The address stays the same.

## Option C: your own web host (cPanel, Plesk or FTP)

1. In your hosting control panel, open **File Manager** (or connect with an FTP client such as FileZilla).
2. Upload the folder contents into the web root (`public_html/`) or a sub-folder (`public_html/ops/`).
   - If you upload the zip, use the panel's **Extract** function.
   - Make sure `index.html` ends up directly inside the chosen folder.
3. Enable **HTTPS**, for example *SSL/TLS Status → Run AutoSSL* or *Let's Encrypt* in cPanel, and force HTTPS redirects if the panel offers it.
4. If you used a sub-folder, edit `404.html` as described in Option B, step 5. To use it as the error page, set it in the panel (*Error Pages*) or add `ErrorDocument 404 /ops/404.html` to `.htaccess`. This is optional: the app's own links never need it.
5. Optional hardening, if the host lets you set headers (Apache `.htaccess`):

   ```apache
   Header set X-Content-Type-Options "nosniff"
   Header set Content-Security-Policy "frame-ancestors 'none'"
   Header set Referrer-Policy "no-referrer"
   ```

## Why HTTPS is required

Passwords are checked with the browser's Web Crypto API, which only works on secure (HTTPS) pages. On a plain `http://` address, sign-in and setup cannot work. HTTPS also lets the browser keep the database under storage pressure (persistent storage). All three options above provide free HTTPS.

## Go-live checklist (Manager)

1. Open the final HTTPS address on the **station's shared device** in Chrome, Edge or Firefox, in a normal window (not private).
2. The system auto-configures a default authorized **Manager** account at initialization. Sign in with username `manager` and the first sign-in password `Manager@2026` (also shown on the sign-in card). The workspace **requires you to set your own password immediately** — it cannot be skipped. Record the new password securely, because it cannot be reset.
3. On **Stations & pumps**, review the **Company profile** panel (organisation name and tagline are editable by the Manager at any time), then **create and provision your stations** — each new station starts with its own Super/Petrol and Diesel tanks, paired pump nozzles and optional Supervisor assignments. Configure tanks and pump counts from each station card.
4. On **Stations & pumps**, create a Supervisor account for each person. Give each one a temporary password in person, and have them change it with the lock button beside their name.
5. Do the first real entry together with a Supervisor, for example today's opening dip or meter readings. Check that it appears on the dashboard and in the audit trail. Avoid made-up test entries: every entry is permanently audited.
6. Download a **full backup** (Data management → Download full backup JSON) and store it off the device. Repeat this every day.
7. Add the address to the device's home screen or bookmarks so staff always use the same address.

## Updating the app during the pilot

Replace the files at the **same address**. Records are untouched, because they are stored in each browser, not in the uploaded files. Download a full backup before every update anyway.

## Help, I need to move the system

- **To a new device:** open the same address on the new device. On the sign-in screen, before the first sign-in, open *"Moving from another device? Restore a full backup instead"*.
- **To a new address:** on the old address, download a full backup. Open the new address and restore that backup from the sign-in screen (the option shows while the workspace is still fresh).

## Important security limitation

This remains a static, browser-local pilot, not a production multi-user financial system. The Supabase SQL foundation under `supabase/` is **not wired to the app**. Receipt evidence and app records remain in one browser's IndexedDB; do not assume the SQL RLS policies protect this UI. Do not use this pilot as production audit evidence until Supabase Auth, the central data layer, private storage, server-side provisioning, UI integration, and end-to-end RLS tests are complete. See `IMPLEMENTATION-NOTES.md` and `supabase/README.md`.
