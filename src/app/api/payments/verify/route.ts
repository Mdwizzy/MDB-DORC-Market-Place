import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to view this order." }, { status: 401 });
    const { reference } = await request.json() as { reference?: string };
    if (!reference) return NextResponse.json({ error: "Missing transaction reference." }, { status: 400 });
    const db = createSupabaseAdminClient();
    const { data: payment } = await db.from("payments").select("id,order_id,amount,currency,status,orders!inner(customer_id)").eq("reference", reference).eq("orders.customer_id", user.id).single();
    if (!payment) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (payment.status === "success") return NextResponse.json({ paid: true });
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const result = await response.json(); const tx = result?.data;
    if (!response.ok || !result.status || tx?.status !== "success" || tx.currency !== payment.currency || Number(tx.amount) !== Number(payment.amount)*100 || tx.reference !== reference) return NextResponse.json({ paid: false, error: "Payment has not been confirmed yet." }, { status: 409 });
    const { error } = await db.rpc("confirm_marketplace_payment", { p_payment_id: payment.id, p_provider_response: tx });
    if (error) return NextResponse.json({ error: "Payment confirmation could not be saved." }, { status: 500 });
    return NextResponse.json({ paid: true });
  } catch (error) {
    console.error("Payment verification failed", error);
    return NextResponse.json({ error: "Could not verify this payment." }, { status: 500 });
  }
}
