# Revlar Analyst Portal

The internal tool Revlar staff use to manage verification cases, review detection
results, write the defensible analyst verdict, and generate court-ready reports.
Brand-matched to the customer site (deep navy, single cyan accent, mono labels).

## Files
- `index.html` — page shell (loads the two files below)
- `styles.css` — all styling and themes
- `app.js` — all logic; **your Supabase keys go at the top of this file**
- `backend/schema.sql` — run once in Supabase to create the tables and guarantees
- `backend/edge-functions.md` — optional server-side hardening (advanced)
- `smoke-test.js` — a 30-second check that login + every view still work

Deploy by copying the whole `portal/` folder into the portal repo; Cloudflare Pages
serves it as a static site (no build step).

---

## Go live in 4 steps
1. **Paste your keys** at the top of `app.js`:
   ```js
   var SUPABASE_URL = "https://YOURPROJECT.supabase.co";
   var SUPABASE_PUBLISHABLE_KEY = "your-publishable-anon-key";
   ```
   Only the **publishable** key belongs here. Never a service-role key.
2. **Create a private bucket** named `case-files` (Storage → New bucket → leave *Public* unchecked).
3. **Run** `backend/schema.sql` in the Supabase SQL Editor (creates tables, the
   collision-free case-reference function, the append-only audit log, RLS, and the
   storage policies).
4. **Add an analyst** under Authentication → Users.

Until keys are pasted, the portal runs in **Preview mode** with sample data so you
can click around. The moment real keys are present, preview mode turns off and real
login + database take over.

The **Generate Report** button calls your existing `generate-report` Edge Function
and downloads the PDF. If it is not deployed, the portal shows a friendly message.

---

## What was built vs. what you deploy
This was delivered in three buckets (per our plan):

**1. In the portal (done):** hash-based routing with deep links + back/forward,
autosaving notes, evidence preview, the **analyst final-verdict + reasoning** field,
copy buttons (reference + hash), command palette (⌘/Ctrl-K), loading skeletons,
verdict card restyle with a confidence gauge, status pipeline, status-colored table
rows, density toggle, light/dark themes, and the file split + this smoke test.

**2. SQL you run (`backend/schema.sql`):** server-side collision-free case
references, the **append-only / tamper-evident activity log**, RLS tied to
authenticated users + `auth.uid()`, the analyst-verdict columns, and private-bucket
storage policies.

**3. Optional/advanced (`backend/edge-functions.md`):** authoritative server-side
hashing, async report jobs with a report history, and role-based access. Code is
provided to deploy and test in your project.

**Dashboard toggles (you, in Supabase):**
- **MFA:** Authentication → Providers/Policies → enable MFA.
- **SSO:** Authentication → SSO (SAML) for newsroom/gov staff.
- **Roles:** set `role` in each user's metadata, then use the role-aware RLS in
  `edge-functions.md`.

---

## Run the smoke test
```bash
cd portal
npm init -y && npm i -D playwright && npx playwright install chromium
node smoke-test.js
```
It signs in, visits every view, opens a case, and fails loudly if a script error or
missing function blanks the app — the exact problem to guard against on every edit.
