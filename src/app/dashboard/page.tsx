import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
export default async function DashboardPage() {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try { supabase=await createSupabaseServerClient(); } catch { redirect("/account"); }
  const { data:{user} }=await supabase.auth.getUser(); if(!user) redirect("/account");
  const { data:profile }=await supabase.from("profiles").select("role,full_name").eq("id",user.id).single();
  return <Dashboard role={profile?.role ?? "customer"} userId={user.id} name={profile?.full_name || user.email || ""}/>;
}
