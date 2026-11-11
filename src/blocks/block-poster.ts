import { z } from "zod";

export function safePosterUrl(source: string) {
  if (/^\/(?!\/)[^\\\s]*$/.test(source)) return true;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

// An authored still for feed readers, print and non-interactive reading.
export const blockPosterSchema = z
  .object({
    src: z
      .string()
      .max(2000)
      .refine(safePosterUrl, "Use an HTTPS or root-relative poster URL."),
    alt: z.string().trim().min(1).max(2000),
  })
  .strict();
