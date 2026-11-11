// Keep the viewport and its scrollbar in sync, without changing admin previews.
export function applyDocumentTheme(background = "#ffffff", text = "#242424") {
  const root = document.documentElement;
  const marker = root.getAttribute("data-public-theme");
  const properties = { "--blog-background": background, "--blog-text": text };
  const previous = Object.keys(properties).map(key => [key, root.style.getPropertyValue(key)]);
  root.setAttribute("data-public-theme", "");
  for (const [key, value] of Object.entries(properties)) root.style.setProperty(key, value);
  return () => {
    if (marker === null) root.removeAttribute("data-public-theme");
    else root.setAttribute("data-public-theme", marker);
    for (const [key, value] of previous) {
      if (value) root.style.setProperty(key, value);
      else root.style.removeProperty(key);
    }
  };
}
