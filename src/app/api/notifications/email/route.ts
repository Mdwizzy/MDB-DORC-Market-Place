import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type NotificationRequest =
  | { type: "vendor_application"; vendorId: string }
  | { type: "vendor_product_submission"; productId: string }
  | { type: "vendor_decision"; vendorId: string }
  | { type: "product_decision"; productId: string };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function sendEmail(to: string[], subject: string, content: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#20344c"><h2 style="color:#244f7a">MDB-DORC Market Place</h2>${content}<p style="color:#788493;font-size:13px">This is an automated marketplace notification.</p></div>` }),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("Email provider rejected notification", response.status, details);
    throw new Error("Email provider could not send the notification.");
  }
  return true;
}

async function adminEmails(db: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: profiles, error } = await db.from("profiles").select("id").in("role", ["admin", "co_admin"]);
  if (error) throw error;
  const { data, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw usersError;
  const addresses = new Set((profiles ?? []).map((profile) => data.users.find((user) => user.id === profile.id)?.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email)));
  process.env.MARKETPLACE_ADMIN_EMAIL?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean).forEach((email) => addresses.add(email));
  return [...addresses];
}

async function authorizeAdmin() {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: profile } = await auth.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "co_admin") return { response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  return { user };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as NotificationRequest;
    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const db = createSupabaseAdminClient();
    let emailSent = false;

    if (body.type === "vendor_application") {
      const { data: vendor } = await db.from("vendors").select("id,business_name,contact_email,user_id,status").eq("id", body.vendorId).eq("user_id", user.id).eq("status", "pending").maybeSingle();
      if (!vendor) return NextResponse.json({ error: "Pending vendor application not found." }, { status: 404 });
      const recipients = await adminEmails(db);
      if (!recipients.length) return NextResponse.json({ error: "No administrator email recipients are configured." }, { status: 503 });
      emailSent = await sendEmail(recipients, `New vendor application: ${vendor.business_name}`, `<p>A new vendor application is waiting for review.</p><p><b>Business:</b> ${escapeHtml(vendor.business_name)}<br><b>Contact email:</b> ${escapeHtml(vendor.contact_email)}</p><p>Sign in to the MDB-DORC dashboard to approve or reject the application.</p>`);
    } else if (body.type === "vendor_product_submission") {
      const { data: product } = await db.from("products").select("id,name,status,vendor_id,vendors!inner(id,user_id,business_name)").eq("id", body.productId).eq("status", "pending").eq("vendors.user_id", user.id).maybeSingle();
      if (!product) return NextResponse.json({ error: "Pending vendor product was not found." }, { status: 404 });
      const recipients = await adminEmails(db);
      if (!recipients.length) return NextResponse.json({ error: "No administrator email recipients are configured." }, { status: 503 });
      const seller = Array.isArray(product.vendors) ? product.vendors[0]?.business_name : (product.vendors as { business_name?: string } | null)?.business_name;
      emailSent = await sendEmail(recipients, `Vendor product submitted: ${product.name}`, `<p>A vendor submitted a product that is waiting for review.</p><p><b>Product:</b> ${escapeHtml(product.name)}<br><b>Vendor:</b> ${escapeHtml(seller)}</p><p>Sign in to the MDB-DORC dashboard to review this product.</p>`);
    } else if (body.type === "vendor_decision") {
      const access = await authorizeAdmin();
      if (access.response) return access.response;
      const { data: vendor } = await db.from("vendors").select("business_name,contact_email,status,rejection_reason").eq("id", body.vendorId).maybeSingle();
      if (!vendor || !["approved", "rejected"].includes(vendor.status)) return NextResponse.json({ error: "Vendor decision not found." }, { status: 404 });
      if (!vendor.contact_email) return NextResponse.json({ error: "Vendor contact email is missing." }, { status: 400 });
      const approved = vendor.status === "approved";
      emailSent = await sendEmail([vendor.contact_email], `Vendor application ${approved ? "approved" : "update"}: ${vendor.business_name}`, approved
        ? `<p>Good news — your vendor application for <b>${escapeHtml(vendor.business_name)}</b> has been approved.</p><p>You can now sign in and submit products to the MDB-DORC Market Place.</p>`
        : `<p>Your vendor application for <b>${escapeHtml(vendor.business_name)}</b> was not approved at this time.</p><p><b>Reason:</b> ${escapeHtml(vendor.rejection_reason || "Please contact the marketplace team for more information.")}</p>`);
    } else if (body.type === "product_decision") {
      const access = await authorizeAdmin();
      if (access.response) return access.response;
      const { data: product } = await db.from("products").select("id,name,status,vendor_id,vendors(id,user_id,business_name,contact_email)").eq("id", body.productId).maybeSingle();
      if (!product || !product.vendor_id || !["approved", "rejected"].includes(product.status)) return NextResponse.json({ error: "Vendor product decision not found." }, { status: 404 });
      const vendor = Array.isArray(product.vendors) ? product.vendors[0] : product.vendors;
      if (!vendor) return NextResponse.json({ error: "Vendor details were not found." }, { status: 404 });
      const approved = product.status === "approved";
      const message = approved ? `Your product “${product.name}” has been approved and is now visible in the marketplace.` : `Your product “${product.name}” was not approved. Please review the listing and contact the marketplace team for guidance.`;
      const { error } = await db.from("vendor_notifications").insert({ vendor_id: vendor.id, user_id: vendor.user_id, title: approved ? "Product approved" : "Product not approved", message });
      if (error) throw error;
      if (!vendor.contact_email) return NextResponse.json({ error: "In-app notice saved, but vendor contact email is missing." }, { status: 400 });
      emailSent = await sendEmail([vendor.contact_email], `${approved ? "Product approved" : "Product update"}: ${product.name}`, `<p>${escapeHtml(message)}</p>`);
    } else {
      return NextResponse.json({ error: "Unknown notification type." }, { status: 400 });
    }

    return NextResponse.json({ success: true, emailSent });
  } catch (error) {
    console.error("Marketplace email notification failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send email notification." }, { status: 502 });
  }
}
