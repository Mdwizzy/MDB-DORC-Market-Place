"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function GoogleIcon() {
  return <svg className="google-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.73 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.26 5.47-4.73 7.16l7.61 5.9c4.45-4.11 7.19-10.16 7.19-17.53z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.92l-7.61-5.9c-2.12 1.42-4.84 2.27-8.29 2.27-6.27 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}

export default function AccountForm() {
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "oauth") setMessage("Google sign in could not be completed. Please try again or use email.");
  }, []);
  const startGoogleSignIn = async () => {
    setBusy(true); setMessage("");
    try {
      const next = new URLSearchParams(window.location.search).get("next");
      const destination = next === "checkout" ? "/?checkout=1" : "/dashboard";
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}` },
      });
      if (error) throw error;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start Google sign in."); setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.assign(next === "checkout" ? "/?checkout=1" : "/dashboard");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not complete sign in."); }
    finally { setBusy(false); }
  };
  return <section className="account-card"><span className="section-kicker">WELCOME TO THE MARKETPLACE</span><h1>{mode === "signin" ? "Good to see you." : "Create your account."}</h1><p>Sign in to shop, track orders, and connect with DORC sellers.</p><div className="account-tabs"><button className={mode==="signin"?"selected":""} onClick={()=>{setMode("signin");setMessage("");}}>Sign in</button><button className={mode==="signup"?"selected":""} onClick={()=>{setMode("signup");setMessage("");}}>Create account</button></div><button className="google-signin" type="button" onClick={startGoogleSignIn} disabled={busy}><GoogleIcon/>Continue with Google</button><div className="account-divider"><span>or use email</span></div><form onSubmit={submit}>{mode==="signup"&&<label>Full name<input autoComplete="name" required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>}<label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={mode==="signin"?"current-password":"new-password"} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary-btn account-submit" disabled={busy}>{busy?"Please wait…":mode==="signin"?"Sign in":"Create account"}<span>→</span></button></form>{message&&<div className="account-message" role="status">{message}</div>}<small className="account-help">Vendor applications are reviewed by the marketplace team. Admin access is provisioned securely and cannot be self-selected.</small><a className="account-back" href="/">← Back to the marketplace</a></section>;
}
