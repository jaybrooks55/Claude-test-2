// ============================================================
// REVLAR — analyze-case Edge Function
// The detection pipeline. Runs SERVER-SIDE so the Hive / Resemble
// keys never touch the browser. The portal calls this after a file
// is uploaded; this downloads the file, runs the right engine,
// derives a verdict + score, and writes it back to the case.
//
// Deploy:   supabase functions deploy analyze-case
// Secrets:  supabase secrets set HIVE_KEY=... RESEMBLE_KEY=...
//           (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided
//            automatically by Supabase to deployed functions.)
//
// IMPORTANT: the exact Hive / Resemble request + response shapes
// depend on your account and API version. The two mapping helpers
// (hiveAnalyze / resembleAnalyze) are marked TODO — confirm them
// against your engine dashboards, then this is production-ready.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const HIVE_KEY = Deno.env.get("HIVE_KEY") ?? "";
const RESEMBLE_KEY = Deno.env.get("RESEMBLE_KEY") ?? "";
const BUCKET = "case-files";

// score → verdict thresholds (tune to taste)
function verdictFromScore(score: number): string {
  if (score >= 70) return "MANIPULATED";
  if (score <= 38) return "AUTHENTIC";
  return "INCONCLUSIVE";
}

// TODO: confirm against Hive Moderation API for your account/version.
// Hive returns class probabilities; map the AI-generated/deepfake
// probability to a 0-100 "manipulation" score.
async function hiveAnalyze(bytes: Uint8Array, mime: string): Promise<{ score: number; raw: unknown }> {
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: mime }), "evidence");
  const res = await fetch("https://api.thehive.ai/api/v2/task/sync", {
    method: "POST",
    headers: { Authorization: `Token ${HIVE_KEY}` },
    body: form,
  });
  const raw = await res.json();
  // Example shape: raw.status[0].response.output[0].classes[] = { class, score }
  let p = 0;
  try {
    const classes = raw?.status?.[0]?.response?.output?.[0]?.classes ?? [];
    const hit = classes.find((c: any) => /ai_generated|deepfake|synthetic/i.test(c.class));
    p = hit ? Number(hit.score) : 0;
  } catch (_) { p = 0; }
  return { score: Math.round(p * 100), raw };
}

// TODO: confirm against Resemble Detect API for your account/version.
async function resembleAnalyze(bytes: Uint8Array, mime: string): Promise<{ score: number; raw: unknown }> {
  const res = await fetch("https://app.resemble.ai/api/v2/detect", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEMBLE_KEY}`, "Content-Type": mime || "audio/wav" },
    body: bytes,
  });
  const raw = await res.json();
  // Example shape: raw.probability_fake (0..1) or raw.score
  let p = 0;
  try { p = Number(raw?.probability_fake ?? raw?.score ?? 0); } catch (_) { p = 0; }
  if (p > 1) p = p / 100; // accept 0-100 or 0-1
  return { score: Math.round(p * 100), raw };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // require a signed-in analyst
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { case_id?: string; file_path?: string; type?: string };
  try { body = await req.json(); } catch (_) { return new Response("Bad request", { status: 400 }); }
  const { case_id, file_path, type } = body;
  if (!case_id || !file_path) return new Response("Missing case_id or file_path", { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // download the evidence file
  const dl = await admin.storage.from(BUCKET).download(file_path);
  if (dl.error || !dl.data) return new Response("File not found in storage", { status: 404 });
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const mime = dl.data.type || "application/octet-stream";

  // route to the right engine
  let result: { score: number; raw: unknown };
  try {
    result = (type === "audio") ? await resembleAnalyze(bytes, mime) : await hiveAnalyze(bytes, mime);
  } catch (e) {
    return new Response("Engine call failed: " + (e as Error).message, { status: 502 });
  }

  const score = Math.max(0, Math.min(100, result.score));
  const verdict = verdictFromScore(score);

  // write the result back to the case (authoritative, server-side)
  await admin.from("cases").update({
    verdict, score, status: "In Progress", engine_results: result.raw,
  }).eq("id", case_id);

  await admin.from("activity_log").insert({
    action: `Automated analysis complete — ${verdict} (${score})`,
    case_reference: case_id,
    analyst: "Detection stack",
    actor: user.id,
  });

  return Response.json({ verdict, score, status: "In Progress" });
});
