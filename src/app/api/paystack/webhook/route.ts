import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  const raw = await request.text();
  const supplied = request.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const event = JSON.parse(raw);
    if (event.event !== "charge.success" || !event.data?.reference) return NextResponse.json({ received: true });
    const db = createSupabaseAdminClient();
    const { data: payment } = await db.from("payments").select("id,order_id,amount,currency,status").eq("reference", event.data.reference).single();
    if (!payment) return NextResponse.json({ received: true });
    if (payment.status === "success") return NextResponse.json({ received: true });
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(event.data.reference)}`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    const verified = await verifyResponse.json();
    const tx = verified?.data;
    if (!verifyResponse.ok || !verified.status || tx?.status !== "success" || tx.currency !== payment.currency || Number(tx.amount) !== Number(payment.amount) * 100 || tx.reference !== event.data.reference) {
      await db.from("payments").update({ status: "failed", provider_response: event.data }).eq("id", payment.id);
      return NextResponse.json({ received: true });
    }
    const { error } = await db.rpc("confirm_marketplace_payment", { p_payment_id: payment.id, p_provider_response: tx });
    if (error) { console.error("Could not confirm paid order", error); return NextResponse.json({ error: "Payment confirmation failed" }, { status: 500 }); }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paystack webhook failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
