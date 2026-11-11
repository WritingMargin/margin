import { tagAttributes } from "../../shared/content-tags";
import { safeMediaUrl } from "../media";
import { unmountPath } from "../base-path";

export type CarouselImage = { src: string; alt: string; caption: string };

export function carouselMarkdown(
  images: CarouselImage[],
  title = "Image gallery",
  fit: "contain" | "cover" = "contain",
) {
  if (images.length < 2 || images.length > 20)
    throw new Error("Add between 2 and 20 images to your carousel.");
  const slides = images.map((image, index) => {
    const src = safeMediaUrl(image.src.trim());
    if (!src)
      throw new Error(
        `Image ${index + 1} needs a valid HTTP or HTTPS image URL.`,
      );
    return `[Image${tagAttributes({ src: unmountPath(src), alt: image.alt, caption: image.caption, frame: "plain" })}]`;
  });
  return `\n\n[Carousel${tagAttributes({ title: title || "Image gallery", fit: fit === "cover" ? "cover" : "contain" })}]\n${slides.join("\n\n")}\n[/Carousel]\n\n`;
}
