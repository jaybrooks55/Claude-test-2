# Backend hardening — Edge Functions (advanced)

These are the server-side pieces from the architecture list. They run **in Supabase**, not in the portal. They are optional but recommended for a court-ready tool. The portal already works without them (it falls back to client-side hashing and the immutable `activity_log` from `schema.sql`); these make the chain of custody and reporting authoritative.

> Note: this is reference code to deploy and test in your Supabase project. It is written to drop into `supabase/functions/<name>/index.ts`. Deploy with `supabase functions deploy <name>`.

---

## 1. `verify-and-hash` — authoritative, tamper-evident hashing

Why: today the SHA-256 is computed in the browser, and a determined user could send a different value. For evidence you may have to defend, the hash should be computed **on the server** from the stored file and written once.

Flow: portal uploads the file to the private `case-files` bucket, then calls this function with the `file_path`. The function downloads the object, hashes it, and stamps the case.

```ts
// supabase/functions/verify-and-hash/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  // service-role client stays on the server only — NEVER in the portal
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // verify the caller is a signed-in user
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { case_id, file_path } = await req.json();
  const { data: file, error } = await admin.storage.from("case-files").download(file_path);
  if (error || !file) return new Response("File not found", { status: 404 });

  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

  await admin.from("cases").update({ file_hash: hash }).eq("id", case_id);
  await admin.from("activity_log").insert({
    action: "Hash verified (server)", case_reference: case_id, actor: user.id,
  });
  return Response.json({ file_hash: hash });
});
```

In the portal, after upload you would `fetch(SUPABASE_URL + "/functions/v1/verify-and-hash", ...)` instead of trusting the browser hash. (The browser hash is still fine to show instantly while this confirms it.)

---

## 2. Async report jobs (instead of one-shot download)

Why: PDF generation can take time, and you want a record of every report produced. Make `generate-report` (your existing function) write a row to a `reports` table and store the PDF in a `reports` bucket; the portal then shows a **report history** per case and lets you re-download prior versions.

```sql
-- add to schema.sql if you adopt this
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id),
  case_reference text,
  storage_path text,          -- path in a private "reports" bucket
  status text not null default 'ready' check (status in ('generating','ready','failed')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "read reports"   on public.reports for select to authenticated using (true);
create policy "insert reports" on public.reports for insert to authenticated with check (true);
```

The portal change is small: after calling `generate-report`, list `reports` for the case and render a "Reports" panel with download links (signed URLs). The current one-shot download keeps working in the meantime.

---

## 3. Roles (admin vs analyst)

Add a `role` to each user via Supabase Auth user metadata, then tighten RLS. Example: only admins may delete clients, only the case creator (or an admin) may change a verdict.

```sql
-- example: restrict verdict changes to the creator or an admin
create or replace function public.is_admin() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;
-- then replace the broad "update cases" policy with role-aware checks as needed.
```
