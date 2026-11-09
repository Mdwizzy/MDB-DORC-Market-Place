"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PickupLocation } from "@/lib/pickup-locations";

export default function PickupLocationManager({ locations, onLocationsChanged, onNotice }: { locations: PickupLocation[]; onLocationsChanged: () => Promise<void>; onNotice: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const db = createSupabaseBrowserClient();

  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) { onNotice("Enter a pickup location name."); return; }
    setBusy(true);
    onNotice("");
    const { error } = await db.from("pickup_locations").insert({ name, active: true });
    setBusy(false);
    if (error) { onNotice(error.code === "23505" ? "A pickup location with that name already exists." : error.message); return; }
    form.reset();
    onNotice(`${name} has been added as a pickup location.`);
    await onLocationsChanged();
  }

  async function setLocationActive(location: PickupLocation, active: boolean) {
    if (!location.id) return;
    setBusy(true);
    onNotice("");
    const { error } = await db.from("pickup_locations").update({ active }).eq("id", location.id);
    setBusy(false);
    if (error) { onNotice(error.message); return; }
    onNotice(`${location.name} ${active ? "activated" : "hidden"}.`);
    await onLocationsChanged();
  }

  return <>
    <form className="dash-form" onSubmit={addLocation}>
      <h3>Add a pickup location</h3>
      <p>Active locations are available to buyers during cart checkout and Buy Now. Hiding a location keeps it on existing orders.</p>
      <label>Location name<input name="name" required maxLength={100} placeholder="e.g. Main Gate"/></label>
      <button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Add pickup location"}</button>
    </form>
    <div className="dash-table" style={{ marginTop: 14 }}>
      <div className="dash-toolbar"><span>{locations.filter((location) => location.active !== false).length} active pickup locations</span></div>
      {locations.length === 0 ? <p>No pickup locations found.</p> : locations.map((location) => <div className="dash-row" key={location.id ?? location.name}>
        <span><b>{location.name}</b><small>{location.active === false ? "Hidden from new orders" : "Available at checkout"}</small></span>
        <div className="row-actions"><span className={`status-tag ${location.active === false ? "rejected" : "approved"}`}>{location.active === false ? "Hidden" : "Active"}</span><button disabled={busy || !location.id} onClick={() => void setLocationActive(location, location.active === false)}>{location.active === false ? "Activate" : "Hide"}</button></div>
      </div>)}
    </div>
  </>;
}
