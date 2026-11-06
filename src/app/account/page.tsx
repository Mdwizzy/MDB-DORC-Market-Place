import AccountForm from "@/components/AccountForm";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import BrandLogo from "@/components/BrandLogo";

export default async function AccountPage() {
  let isSignedIn = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    isSignedIn = Boolean(user);
  } catch {
    // Keep the sign-in page available when Supabase has not been configured.
  }
  if (isSignedIn) redirect("/dashboard");
  return <main className="account-page"><a className="brand" href="/"><BrandLogo/></a><AccountForm /></main>;
}
