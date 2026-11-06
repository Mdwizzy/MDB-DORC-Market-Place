"use client";

import { useEffect, useState } from "react";

export default function ProductImageUpload({ name = "image", required = true }: { name?: string; required?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    if (selected && !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("Choose a JPG, PNG, or WebP image."); event.target.value = ""; setFile(null); return;
    }
    if (selected && selected.size > 5 * 1024 * 1024) {
      setError("The image must be 5 MB or smaller."); event.target.value = ""; setFile(null); return;
    }
    setFile(selected);
  }

  return <div className="product-image-upload">
    <label htmlFor={`${name}-upload`}>Product photo <span>{required?"Required":"Optional"} · JPG, PNG or WebP · up to 5 MB</span></label>
    <div className={`upload-drop ${preview ? "has-preview" : ""}`}>
      {preview ? <img src={preview} alt="Selected product preview"/> : <span className="upload-placeholder" aria-hidden="true">↑</span>}
      <div className="upload-prompt"><b>{file?.name ?? "Choose a product image"}</b><small>{file ? "Image ready to upload" : "Tap to browse photos on your device"}</small></div>
      <input id={`${name}-upload`} name={name} type="file" accept="image/jpeg,image/png,image/webp" required={required} onChange={chooseFile}/>
    </div>
    {error&&<small className="upload-error" role="alert">{error}</small>}
  </div>;
}
