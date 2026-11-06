import PaymentResult from "@/components/PaymentResult";
import BrandLogo from "@/components/BrandLogo";
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) { const params=await searchParams; return <main className="account-page"><a className="brand" href="/"><BrandLogo/></a><PaymentResult reference={params.reference ?? params.trxref ?? ""} /></main>; }
