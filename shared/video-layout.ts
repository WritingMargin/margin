export const videoRatios = [
  "auto",
  "16:9",
  "4:3",
  "1:1",
  "9:16",
  "21:9",
] as const;
const widths: Record<string, string> = {
  full: "100%",
  wide: "85%",
  small: "55%",
  "two-thirds": "66.6667%",
  half: "50%",
  third: "33.3333%",
};

export function videoLayout(attrs: Record<string, unknown>) {
  const cssWidth = videoWidth(attrs);
  const align =
    attrs.align === "left" || attrs.align === "right" ? attrs.align : "center";
  const wrap =
    (attrs.wrap === true || attrs.wrap === "true") &&
    align !== "center" &&
    cssWidth !== "100%";
  const ratio = videoRatios.includes(
    attrs.ratio as (typeof videoRatios)[number],
  )
    ? String(attrs.ratio)
    : "auto";
  return {
    width: cssWidth,
    align,
    wrap,
    ratio,
    cssRatio: ratio === "auto" ? "auto" : ratio.replace(":", " / "),
  };
}

function videoWidth(attrs: Record<string, unknown>) {
  const width = String(attrs.width || "full");
  const percentage = /^(\d{1,3})%$/.exec(width);
  const cssWidth =
    widths[width] ||
    (percentage && Number(percentage[1]) >= 25 && Number(percentage[1]) <= 100
      ? `${Number(percentage[1])}%`
      : "100%");
  return cssWidth;
}
