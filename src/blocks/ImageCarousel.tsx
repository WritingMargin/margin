import { ArrowLeft,ArrowRight } from "lucide-react";
import { type CSSProperties } from "react";
import "./carousel.css";

import { useImageCarousel } from "./useImageCarousel";
export default function ImageCarousel(
  props: Parameters<typeof useImageCarousel>[0],
) {
  const state = useImageCarousel(props);
  const {
    onPointerMove,
    onPointerDown,
    onKeyDown,
    title,
    fit,
    slides,
    track,
    active,
    setActive,
    id,
    nearest,
    go,
    finishDrag,
  } = state;
  if (!slides.length)
    return (
      <p className="md-invalid-media">
        Add image directives inside this carousel to show your slides.
      </p>
    );
  return (
    <section
      className="image-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={title}
      style={{ "--carousel-fit": fit } as CSSProperties}
    >
      <header className="carousel-heading">
        <span>{title}</span>
        <div className="carousel-controls">
          <span
            className="carousel-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {active + 1} / {slides.length}
          </span>
          <button
            type="button"
            aria-label="Previous image"
            aria-controls={id}
            disabled={active === 0}
            onClick={() => go(active - 1)}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Next image"
            aria-controls={id}
            disabled={active === slides.length - 1}
            onClick={() => go(active + 1)}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </header>
      <div
        id={id}
        ref={track}
        className="carousel-track"
        tabIndex={0}
        aria-label="Images. Use arrow keys, swipe, or drag to browse."
        onScroll={() => setActive(nearest())}
        onKeyDown={onKeyDown}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
      >
        {slides.map((slide, index) => (
          <div
            className="carousel-slide"
            key={slide.key ?? index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
          >
            {slide}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <p className="carousel-hint">Swipe or drag to explore</p>
      )}
    </section>
  );
}
