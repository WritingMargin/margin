type ShareBrowser = Partial<Pick<Navigator, "share" | "clipboard">>;

export async function shareArticle(
  title: string,
  url: string,
  browser: ShareBrowser,
): Promise<"shared" | "cancelled" | "copied" | "manual"> {
  if (browser.share) {
    try {
      await browser.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled";
    }
  }
  try {
    await browser.clipboard!.writeText(url);
    return "copied";
  } catch {
    return "manual";
  }
}

export function socialShareLinks(title: string, url: string) {
  const encodedURL = encodeURIComponent(url);
  const text = encodeURIComponent(`${title}\n${url}`);
  return [
    {
      label: "X",
      href: `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodedURL}`,
    },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedURL}`,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedURL}`,
    },
    { label: "WhatsApp", href: `https://wa.me/?text=${text}` },
    {
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${text}`,
    },
  ];
}

// DEV's supported sharing intent creates a draft for the reader to review.
export function devShareLink(title: string, url: string) {
  const draft = `---\ntitle: ${JSON.stringify(title)}\npublished: false\n---\n\n${url}\n`;
  return `https://dev.to/new?prefill=${encodeURIComponent(draft)}`;
}
