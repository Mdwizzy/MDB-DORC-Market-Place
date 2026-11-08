import Marketplace from "@/components/Marketplace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { marketplaceCategories, type Product } from "@/lib/products";

export const dynamic = "force-dynamic";
export default async function Home() {
  let catalog: Product[] = [];
  let accountHref = "/account";
  let accountUser: { id: string; name: string; email: string; avatarUrl?: string } | null = null;
  try {
    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      accountHref = "/dashboard";
      accountUser = {
        id: user.id,
        name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Account"),
        email: user.email ?? "",
        avatarUrl: typeof (user.user_metadata?.avatar_url ?? user.user_metadata?.picture) === "string" ? user.user_metadata?.avatar_url ?? user.user_metadata?.picture : undefined,
      };
    }
    const pageSize=500;
    const data:any[]=[];
    for(let from=0;;from+=pageSize){
      const {data:page,error}=await db.from("products").select("id,name,description,price_ngn,stock,featured,image_path,rating,review_count,vendor_id,categories(name)").eq("status","approved").gt("stock",0).order("featured",{ascending:false}).order("created_at",{ascending:false}).range(from,from+pageSize-1);
      if(error)throw error;
      data.push(...(page??[]));
      if(!page||page.length<pageSize)break;
    }
    if (data.length) {
      const vendorIds=[...new Set(data.map((p:any)=>p.vendor_id).filter(Boolean))];
      const names=vendorIds.length?(await Promise.all(Array.from({length:Math.ceil(vendorIds.length/pageSize)},(_,index)=>db.from("vendor_public_profiles").select("id,business_name").in("id",vendorIds.slice(index*pageSize,(index+1)*pageSize))))).flatMap((result)=>result.data??[]):[];
      const nameById=new Map(names.map((v:any)=>[v.id,v.business_name]));
      catalog = await Promise.all(data.map(async (p: any) => { const imageUrl=p.image_path?db.storage.from("product-images").getPublicUrl(p.image_path).data.publicUrl:undefined;const categoryName=p.categories?.name??"Marketplace";const category=marketplaceCategories.find((item)=>item.name===categoryName);return { id:p.id,name:p.name,description:p.description??"",category:categoryName,price:Number(p.price_ngn),rating:Number(p.rating??0),reviews:Number(p.review_count??0),stock:Number(p.stock),seller:p.vendor_id?(nameById.get(p.vendor_id)??"DORC seller"):"MDB-DORC",emoji:category?.emoji??"🛍️",tone:category?.tone??"cat-mint",badge:p.featured?"Featured":undefined,imageUrl }; }));
    }
  } catch { /* Keep the sample catalog visible until services are configured. */ }
  return <Marketplace initialProducts={catalog} accountHref={accountHref} accountUser={accountUser} />;
}
