/**
 * Secure administrator bootstrap — run locally by an operator, never exposed
 * over HTTP. Requires the Supabase service-role key in the environment
 * (.env.local is read automatically). Every change is written to the audit log.
 *
 *   npm run bootstrap:admin -- university --slug ksu --name-en "King Saud University" --name-ar "جامعة الملك سعود" [--lat 24.72 --lng 46.62]
 *   npm run bootstrap:admin -- promote --email you@example.com --role global_admin
 *   npm run bootstrap:admin -- promote --email head@example.com --role university_admin
 *   npm run bootstrap:admin -- list-admins
 *
 * The person being promoted must have registered and confirmed their email.
 */
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

type Role = "user" | "security" | "university_admin" | "global_admin";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const [command, ...rest] = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    args[key] = next && !next.startsWith("--") ? (i++, next) : "true";
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. in .env.local).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function confirm(question: string) {
  if (args.yes === "true") return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function audit(universityId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
  await sb.from("audit_events").insert({ university_id: universityId, actor_id: null, action, target_type: targetType, target_id: targetId, metadata: { ...metadata, via: "bootstrap-cli" } });
}

async function findUserByEmail(email: string) {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function createUniversity() {
  const { slug, "name-en": nameEn, "name-ar": nameAr, lat, lng } = args;
  if (!slug || !nameEn || !nameAr) throw new Error("--slug, --name-en and --name-ar are required");
  const { data, error } = await sb.from("universities")
    .insert({ slug, name_en: nameEn, name_ar: nameAr, center_lat: lat ? Number(lat) : null, center_lng: lng ? Number(lng) : null })
    .select("id").single();
  if (error) throw error;
  console.log(`University created: ${nameEn} (${data.id})`);
}

async function promote() {
  const email = args.email;
  const role = (args.role ?? "global_admin") as Role;
  if (!email) throw new Error("--email is required");
  if (!["user", "security", "university_admin", "global_admin"].includes(role)) throw new Error("invalid --role");
  const user = await findUserByEmail(email);
  if (!user) throw new Error("No account with that email. Ask the person to register first.");
  if (!user.email_confirmed_at) throw new Error("The account's email is not confirmed yet.");
  const { data: profile, error } = await sb.from("profiles").select("id, role, university_id, full_name").eq("id", user.id).single();
  if (error || !profile) throw new Error("Profile not found for this account.");
  if (!(await confirm(`Grant role "${role}" to ${profile.full_name} <${email}> (currently "${profile.role}")?`))) return console.log("Aborted.");
  const { error: upErr } = await sb.from("profiles").update({ role }).eq("id", user.id);
  if (upErr) throw upErr;
  await audit(profile.university_id, "bootstrap.role_granted", "profile", user.id, { from: profile.role, to: role });
  console.log(`Done: ${email} is now ${role}.`);
}

async function listAdmins() {
  const { data, error } = await sb.from("profiles").select("id, full_name, role, university_id").in("role", ["global_admin", "university_admin"]);
  if (error) throw error;
  console.table(data);
}

try {
  if (command === "university") await createUniversity();
  else if (command === "promote") await promote();
  else if (command === "list-admins") await listAdmins();
  else {
    console.log("Usage: npm run bootstrap:admin -- <university|promote|list-admins> [options]");
    process.exit(command ? 1 : 0);
  }
} catch (e) {
  console.error("Error:", (e as Error).message);
  process.exit(1);
}
