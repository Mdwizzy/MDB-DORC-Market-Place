"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { MarketplaceCategory } from "@/lib/products";

export default function CategoryManager({ categories, onCategoriesChanged, onNotice }: { categories: MarketplaceCategory[]; onCategoriesChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const db = createSupabaseBrowserClient();

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) { onNotice("Enter a category name using letters or numbers."); return; }

    setBusy(true);
    onNotice("");
    const { error } = await db.from("categories").insert({ name, slug, emoji: String(values.get("emoji") ?? "🛍️").trim() || "🛍️", tone: String(values.get("tone") ?? "cat-mint"), active: true });
    setBusy(false);
    if (error) { onNotice(error.message); return; }
    form.reset();
    onNotice(`${name} category added and made available in the marketplace.`);
    await onCategoriesChanged();
  }

  async function setCategoryActive(category: MarketplaceCategory, active: boolean) {
    if (!category.id) return;
    setBusy(true);
    onNotice("");
    const { error } = await db.from("categories").update({ active }).eq("id", category.id);
    setBusy(false);
    if (error) { onNotice(error.message); return; }
    onNotice(`${category.name} category ${active ? "activated" : "hidden"}.`);
    await onCategoriesChanged();
  }

  return <>
    <form className="dash-form" onSubmit={addCategory}>
      <h3>Add a marketplace category</h3>
      <p>New categories become available on the storefront and in all product forms.</p>
      <div className="form-pair">
        <label>Category name<input name="name" required maxLength={60} placeholder="e.g. Pet Supplies"/></label>
        <label>Category icon<input name="emoji" defaultValue="🛍️" maxLength={8} aria-label="Category emoji icon"/></label>
      </div>
      <label>Card color<select name="tone" defaultValue="cat-mint"><option value="cat-mint">Blue</option><option value="cat-lav">Lavender</option><option value="cat-peach">Peach</option><option value="cat-lemon">Lemon</option></select></label>
      <button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Add category"}</button>
    </form>
    <div className="dash-table" style={{ marginTop: 14 }}>
      <div className="dash-toolbar"><span>{categories.filter((category) => category.active !== false).length} active categories</span></div>
      {categories.length === 0 ? <p>No categories found.</p> : categories.map((category) => <div className="dash-row" key={category.id ?? category.slug}>
        <span><b>{category.emoji} {category.name}</b><small>{category.slug} · {category.active === false ? "Hidden" : "Active"}</small></span>
        <div className="row-actions"><span className={`status-tag ${category.active === false ? "rejected" : "approved"}`}>{category.active === false ? "Hidden" : "Active"}</span><button disabled={busy || !category.id} onClick={() => void setCategoryActive(category, category.active === false)}>{category.active === false ? "Activate" : "Hide"}</button></div>
      </div>)}
    </div>
  </>;
}
