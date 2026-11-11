export function codeNoWrap(meta = "") {
  return /(?:^|\s)nowrap(?=\s|$)/.test(meta);
}

export function codeWrapMeta(meta: string, nowrap: boolean) {
  const without = meta.replace(/(^|\s)nowrap(?=\s|$)/g, "$1").trim();
  return nowrap ? [without, "nowrap"].filter(Boolean).join(" ") : without;
}
