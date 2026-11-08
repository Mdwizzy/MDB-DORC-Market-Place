"use client";

import { useEffect, useRef, useState } from "react";

const MAX_IMAGES = 2;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProductImageUpload({ name = "images", required = true }: { name?: string; required?: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => { setFiles([]); setError(""); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError("");
    if (selected.length > MAX_IMAGES) {
      setError("Choose no more than 2 product photos.");
      event.target.value = "";
      setFiles([]);
      return;
    }
    const invalidType = selected.find((file) => !ALLOWED_TYPES.includes(file.type));
    if (invalidType) {
      setError("Choose JPG, PNG, or WebP photos.");
      event.target.value = "";
      setFiles([]);
      return;
    }
    if (selected.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("Each product photo must be 5 MB or smaller.");
      event.target.value = "";
      setFiles([]);
      return;
    }
    setFiles(selected);
  }

  return <div className="product-image-upload">
    <label htmlFor={`${name}-upload`}>Product photos <span>{required ? "At least 1 required" : "Optional"} · Up to 2 · JPG, PNG or WebP · 5 MB each</span></label>
    <div className={`upload-drop ${previews.length ? "has-preview" : ""}`}>
      {previews.length ? <div className="upload-previews">{previews.map((preview, index) => <img key={preview} src={preview} alt={`Selected product photo ${index + 1}`}/>)}</div> : <span className="upload-placeholder" aria-hidden="true">↑</span>}
      <div className="upload-prompt"><b>{files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} selected` : "Choose product photos"}</b><small>{files.length ? files.map((file) => file.name).join(", ") : "Select up to 2 photos at once from your device"}</small></div>
      <input ref={inputRef} id={`${name}-upload`} name={name} type="file" accept="image/jpeg,image/png,image/webp" multiple required={required} onChange={chooseFiles}/>
    </div>
    {error && <small className="upload-error" role="alert">{error}</small>}
  </div>;
}
