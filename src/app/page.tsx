import Marketplace from "@/components/Marketplace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { products, type Product } from "@/lib/products";

export const dynamic = "force-dynamic";
export default async function Home() {
  let catalog: Product[] = products;
  try {
    const db = await createSupabaseServerClient();
    const { data } = await db.from("products").select("id,name,price_ngn,stock,featured,image_path,rating,review_count,vendor_id,categories(name)").eq("status","approved").gt("stock",0).order("featured",{ascending:false}).limit(40);
    if (data) {
      const vendorIds=[...new Set(data.map((p:any)=>p.vendor_id).filter(Boolean))];
      const names=vendorIds.length?(await db.from("vendor_public_profiles").select("id,business_name").in("id",vendorIds)).data??[]:[];
      const nameById=new Map(names.map((v:any)=>[v.id,v.business_name]));
      catalog = await Promise.all(data.map(async (p: any) => { let imageUrl: string|undefined; if(p.image_path){const signed=await db.storage.from("product-images").createSignedUrl(p.image_path,3600);imageUrl=signed.data?.signedUrl;} const sample=products.find((item)=>item.id===p.id); return { id:p.id,name:p.name,category:p.categories?.name??"Marketplace",price:Number(p.price_ngn),rating:Number(p.rating??0),reviews:Number(p.review_count??0),stock:Number(p.stock),seller:p.vendor_id?(nameById.get(p.vendor_id)??"DORC seller"):"MDB-DORC",emoji:sample?.emoji??"✦",tone:sample?.tone??"mint",badge:p.featured?"Featured":sample?.badge,imageUrl:imageUrl??sample?.imageUrl }; }));
    }
  } catch { /* Keep the sample catalog visible until services are configured. */ }
  return <Marketplace initialProducts={catalog} />;
}
