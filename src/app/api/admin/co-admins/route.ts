import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function authorize() {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: profile } = await auth.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { response: NextResponse.json({ error: "Only the primary admin can manage co-admins." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  try {
    const access = await authorize();
    if (access.response) return access.response;
    const db = createSupabaseAdminClient();
    const [{ data: profiles, error }, { data: audit, error: auditError }] = await Promise.all([
      db.from("profiles").select("id,full_name,created_at").eq("role", "co_admin").order("created_at", { ascending: false }),
      db.from("audit_log").select("id,actor_id,action,entity_type,entity_id,details,created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if (error || auditError) throw error ?? auditError;
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
    const emails = new Map(users.map((user) => [user.id, user.email ?? ""]));
    return NextResponse.json({ coAdmins: (profiles ?? []).map((profile) => ({ ...profile, email: emails.get(profile.id) ?? "" })), audit: (audit ?? []).map((entry) => ({ ...entry, actor_email: emails.get(entry.actor_id) ?? "Account removed" })) });
  } catch (error) {
    console.error("Co-admin list failed", error);
    return NextResponse.json({ error: "Could not load co-admin management." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await authorize();
    if (access.response) return access.response;
    const body = await request.json() as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const db = createSupabaseAdminClient();
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: { role: "co_admin" } });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const { error: updateError } = await db.from("profiles").update({ role: "co_admin" }).eq("id", data.user.id);
    if (updateError) throw updateError;
    const { error: auditError } = await db.from("audit_log").insert({ actor_id: access.user!.id, action: "invite", entity_type: "co_admin", entity_id: data.user.id, details: { email } });
    if (auditError) throw auditError;
    return NextResponse.json({ success: true, message: `Invitation sent to ${email}.` });
  } catch (error) {
    console.error("Co-admin invitation failed", error);
    return NextResponse.json({ error: "Could not invite this co-admin." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await authorize();
    if (access.response) return access.response;
    const { userId } = await request.json() as { userId?: string };
    if (!userId || userId === access.user!.id) return NextResponse.json({ error: "Choose a different co-admin account." }, { status: 400 });
    const db = createSupabaseAdminClient();
    const { data: target } = await db.from("profiles").select("id,full_name").eq("id", userId).eq("role", "co_admin").single();
    if (!target) return NextResponse.json({ error: "Co-admin account not found." }, { status: 404 });
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
    const targetEmail = users.find((u) => u.id === userId)?.email ?? "";
    const { error: auditError } = await db.from("audit_log").insert({ actor_id: access.user!.id, action: "remove", entity_type: "co_admin", entity_id: userId, details: { email: targetEmail, full_name: target.full_name } });
    if (auditError) throw auditError;
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
    return NextResponse.json({ success: true, message: `${targetEmail || "Co-admin"} was removed.` });
  } catch (error) {
    console.error("Co-admin removal failed", error);
    return NextResponse.json({ error: "Could not remove this co-admin." }, { status: 500 });
  }
}
