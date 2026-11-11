import type { CSSProperties } from "react";
import type { FeedHeaderDesign } from "../../shared/feed-design";

export function feedRowStyle(design?: FeedHeaderDesign): CSSProperties {
  return {
    "--feed-padding": design?.paddingBlock === undefined ? undefined : `${design.paddingBlock}px`,
    "--feed-gap": design?.gap === undefined ? undefined : `${design.gap}px`,
  } as CSSProperties;
}
