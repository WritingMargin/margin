/** Typeface identifiers and bundled font families. */
export const fontIds = [
  "serif",
  "sans",
  "source-serif",
  "playfair",
  "dm-sans",
  "plex-mono",
  "caveat",
  "kalam",
  "dancing-script",
  "oswald",
] as const;
export type BlogFont = (typeof fontIds)[number];
export const typography: Record<
  BlogFont,
  { name: string; description: string; family: string }
> = {
  serif: {
    name: "Lora",
    description: "Warm editorial",
    family: "'Lora', Georgia, serif",
  },
  sans: {
    name: "Inter",
    description: "Clean and modern",
    family: "'Inter', Arial, sans-serif",
  },
  "source-serif": {
    name: "Source Serif 4",
    description: "Literary classic",
    family: "'Source Serif 4', Georgia, serif",
  },
  playfair: {
    name: "Playfair Display",
    description: "Expressive contrast",
    family: "'Playfair Display', Georgia, serif",
  },
  "dm-sans": {
    name: "DM Sans",
    description: "Soft and geometric",
    family: "'DM Sans', Arial, sans-serif",
  },
  "plex-mono": {
    name: "IBM Plex Mono",
    description: "A technical notebook",
    family: "'IBM Plex Mono', monospace",
  },
  caveat: {
    name: "Caveat",
    description: "Casual handwriting",
    family: "'Caveat', cursive",
  },
  kalam: {
    name: "Kalam",
    description: "Handwritten notes",
    family: "'Kalam', cursive",
  },
  "dancing-script": {
    name: "Dancing Script",
    description: "Flowing script",
    family: "'Dancing Script', cursive",
  },
  oswald: {
    name: "Oswald",
    description: "Condensed headlines",
    family: "'Oswald', sans-serif",
  },
};
