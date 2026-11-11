export const palette = [
  "#537c68",
  "#b8794f",
  "#668aaa",
  "#8f6aaa",
  "#ad6076",
  "#858128",
  "#3b8492",
  "#656976",
];
export const format = (n: number) =>
  new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    notation: Math.abs(n) >= 10000 ? "compact" : "standard",
  }).format(n);
