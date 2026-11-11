import { useEffect, useRef, type ComponentProps } from "react";

export function activeContentsSection(sections: { id: string; top: number }[], line: number, atEnd = false) {
  if (!sections.length) return "";
  if (atEnd) return sections[sections.length - 1].id;
  return sections.filter(section => section.top <= line).at(-1)?.id ?? sections[0].id;
}

/** Keep tracking scoped to this article, including scrollable editor previews. */
export default function ContentsLayout({ children, ...props }: ComponentProps<"div">) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layout = root.current;
    if (!layout) return;
    const nav = layout.querySelector<HTMLElement>(".article-toc");
    const prose = layout.querySelector<HTMLElement>(".article-prose");
    if (!nav || !prose) return;
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const headings = Array.from(prose.querySelectorAll<HTMLElement>("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]"));
      const linked = new Set(links.map(link => link.getAttribute("href")?.slice(1)));
      const visible = headings.filter(heading => linked.has(heading.id) && heading.getClientRects().length > 0);
      const sections = visible.map(heading => ({ id: heading.id, top: heading.getBoundingClientRect().top }));
      const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const active = activeContentsSection(sections, Math.min(160, window.innerHeight * .25), atEnd);
      for (const link of links) {
        if (link.getAttribute("href") === `#${active}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    resize.observe(prose);
    mutations.observe(prose, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [children]);
  return <div {...props} ref={root}>{children}</div>;
}
