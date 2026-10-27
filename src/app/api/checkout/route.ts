import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "Sign in before placing an order." }, { status: 401 });
    const body = await request.json() as { items?: { productId: string; quantity: number }[]; pickupLocation?: string };
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) return NextResponse.json({ error: "Your cart is empty or too large." }, { status: 400 });
    if (!["E-Block", "MSB Site Office"].includes(body.pickupLocation ?? "")) return NextResponse.json({ error: "Choose a valid pickup location." }, { status: 400 });
    const items = body.items.map(i => ({ product_id: i.productId, quantity: Number(i.quantity) }));
    if (items.some(i => !i.product_id || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 25)) return NextResponse.json({ error: "One or more cart quantities are invalid." }, { status: 400 });
    const db = createSupabaseAdminClient();
    const { data: orderId, error } = await db.rpc("create_pending_marketplace_order", { p_customer_id: user.id, p_pickup_name: body.pickupLocation, p_items: items });
    if (error || !orderId) return NextResponse.json({ error: error?.message ?? "Could not create the order." }, { status: 400 });
    const { data: order } = await db.from("orders").select("id,total_amount").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order was created but could not be loaded." }, { status: 500 });
    const reference = `mdb_${order.id.replaceAll("-", "")}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const { data: payment, error: saveError } = await db.from("payments").insert({ order_id: order.id, provider: "paystack", reference, amount: order.total_amount, currency: "NGN", status: "pending" }).select("id").single();
    if (saveError || !payment) { await db.rpc("cancel_pending_marketplace_order", { p_order_id: order.id }); return NextResponse.json({ error: "Payment reference could not be saved." }, { status: 500 }); }
    let response: Response;
    try { response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, amount: Number(order.total_amount) * 100, currency: "NGN", reference, callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/verify`, metadata: { order_id: order.id, pickup_location: body.pickupLocation } }),
    }); } catch { await db.from("payments").delete().eq("id",payment.id); await db.rpc("cancel_pending_marketplace_order", { p_order_id: order.id }); return NextResponse.json({ error: "The payment provider could not be reached. Please try again." }, { status: 502 }); }
    let result: any; try { result = await response.json(); } catch { result = null; }
    if (!response.ok || !result?.status || !result?.data?.authorization_url) { await db.from("payments").delete().eq("id",payment.id); await db.rpc("cancel_pending_marketplace_order", { p_order_id: order.id }); return NextResponse.json({ error: "The payment provider could not start checkout. Please try again." }, { status: 502 }); }
    return NextResponse.json({ authorizationUrl: result.data.authorization_url, reference });
  } catch (error) {
    console.error("Checkout initialization failed", error);
    return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 500 });
  }
}
