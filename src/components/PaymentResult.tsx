"use client";
import { useEffect, useState } from "react";
export default function PaymentResult({ reference }: { reference: string }) {
  const [state,setState] = useState<"checking"|"paid"|"pending"|"error">("checking");
  useEffect(()=>{ if(!reference){setState("error");return;} fetch("/api/payments/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference})}).then(async r=>{const data=await r.json();setState(r.ok&&data.paid?"paid":r.status===409?"pending":"error");}).catch(()=>setState("error")); },[reference]);
  return <section className="account-card payment-result"><span className="section-kicker">PAYMENT UPDATE</span><h1>{state==="checking"?"Checking your payment…":state==="paid"?"Order confirmed.":state==="pending"?"Payment is processing.":"We couldn’t confirm that."}</h1><p>{state==="checking"?"Please wait while we securely verify the transaction.":state==="paid"?"Your payment has been verified. Your order is now being prepared.":state==="pending"?"If your account was charged, wait a moment and check your order again. Do not pay a second time yet.":"Please check your order status or contact the marketplace team before trying again."}</p><a className="primary-btn" href="/">Return to marketplace <span>→</span></a></section>;
}
