"use client";

import { useEffect, useRef, useState } from "react";

export default function ProductImageGallery({ images, image, name, fallback }: { images?: string[]; image?: string; name: string; fallback: string }) {
  const gallery = images?.length ? images : image ? [image] : [];
  const galleryKey = gallery.join("|");
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => setActiveIndex(0), [galleryKey]);

  function moveSlide(direction: number) {
    setActiveIndex((current) => (current + direction + gallery.length) % gallery.length);
  }

  return <div className={`product-detail-image${gallery.length > 1 ? " has-gallery" : ""}`}>
    {gallery.length ? <>
      <div className="product-gallery-stage" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
        if (touchStartX.current === null || gallery.length < 2) return;
        const distance = event.changedTouches[0]?.clientX - touchStartX.current;
        if (distance > 40) moveSlide(-1);
        if (distance < -40) moveSlide(1);
        touchStartX.current = null;
      }}>
        <img src={gallery[activeIndex]} alt={`${name} photo ${activeIndex + 1}`} />
        {gallery.length > 1 && <>
          <button type="button" className="gallery-arrow previous" aria-label="Previous product photo" onClick={() => moveSlide(-1)}>‹</button>
          <button type="button" className="gallery-arrow next" aria-label="Next product photo" onClick={() => moveSlide(1)}>›</button>
          <span className="gallery-count">{activeIndex + 1} / {gallery.length}</span>
        </>}
      </div>
      {gallery.length > 1 && <div className="product-gallery-thumbnails" aria-label="Product photos">
        {gallery.map((url, index) => <button type="button" key={url} className={`gallery-thumb${index === activeIndex ? " active" : ""}`} aria-label={`Show product photo ${index + 1}`} aria-pressed={index === activeIndex} onClick={() => setActiveIndex(index)}><img src={url} alt="" /></button>)}
      </div>}
    </> : <span aria-hidden="true">{fallback}</span>}
  </div>;
}
