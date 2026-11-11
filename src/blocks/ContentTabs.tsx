import type { Element } from "hast";
import { visit } from "unist-util-visit";
import {
Children,
useEffect,
isValidElement,
useId,
useMemo,
useRef,
useState,
type CSSProperties,
type ReactNode,
} from "react";
import type { TabsOptions } from "../../shared/tabs";
import ContentTabNavigation from "./ContentTabNavigation";
import "./tabs.css";

type PanelProps = { className?: string; node?: Element; children?: ReactNode };

export default function ContentTabs({
  children,
  orientation = "horizontal",
  title = "Tabbed content",
  variant = "underline",
  spacing = "comfortable",
  initial = 1,
  accent,
  radius,
}: Partial<TabsOptions> & {
  children: ReactNode;
  title?: string;
}) {
  const id = useId();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const direction = narrow ? "horizontal" : orientation;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [selection, setSelection] = useState({ initial, index: initial - 1 });
  const selected =
    selection.initial === initial ? selection.index : initial - 1;
  const setSelected = (index: number) => setSelection({ initial, index });
  const style = tabStyles(accent, radius);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const nodes = useMemo(() => Children.toArray(children), [children]);
  const panels = useMemo(() => nodes.filter(
    (node) =>
      isValidElement<PanelProps>(node) &&
      node.props.className?.split(" ").includes("md-tab"),
  ), [nodes]);
  useSectionPanel(panels, initial, setSelection);
  const extra = nodes.filter(
    (node) =>
      !panels.includes(node) && (typeof node !== "string" || node.trim()),
  );
  const active = Math.min(selected, Math.max(0, panels.length - 1));
  if (!panels.length)
    return (
      <div className="md-tabs-empty">
        <p>Add a [Tab title="…"] section inside this tab group.</p>
        {children}
      </div>
    );
  return (
    <div
      className={`content-tabs content-tabs-${orientation} content-tabs-${variant} content-tabs-${spacing}`}
      style={style}
    >
      <ContentTabNavigation title={title} direction={direction}>
        {panels.map((panel, index) => {
          const props = isValidElement<PanelProps>(panel) ? panel.props : {};
          const label =
            String(props.node?.properties.dataTabTitle || "").trim() ||
            `Tab ${index + 1}`;
          return (
            <button
              type="button"
              role="tab"
              key={index}
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel-${index}`}
              aria-selected={index === active}
              tabIndex={index === active ? 0 : -1}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                const previous =
                  direction === "vertical" ? "ArrowUp" : "ArrowLeft";
                const next =
                  direction === "vertical" ? "ArrowDown" : "ArrowRight";
                let target: number;
                if (event.key === previous)
                  target = (index - 1 + panels.length) % panels.length;
                else if (event.key === next)
                  target = (index + 1) % panels.length;
                else if (event.key === "Home") target = 0;
                else if (event.key === "End") target = panels.length - 1;
                else return;
                event.preventDefault();
                setSelected(target);
                buttons.current[target]?.focus();
              }}
            >
              {label}
            </button>
          );
        })}
      </ContentTabNavigation>
      <div className="content-tab-panels">
        {panels.map((panel, index) => (
          <div
            key={index}
            id={`${id}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${index}`}
            hidden={index !== active}
            tabIndex={0}
          >
            {/* Include every panel in HTML; unmount inactive media after hydration. */}
            {(!hydrated || index === active) && isValidElement<PanelProps>(panel)
              ? panel.props.children
              : null}
          </div>
        ))}
      </div>
      {extra.length > 0 && <div className="content-tabs-extra">{extra}</div>}
    </div>
  );
}

// Inactive panels unmount media. Resolve the fragment against the Markdown
// tree so the requested panel can mount before the browser scrolls to it.
function useSectionPanel(panels: ReactNode[], initial: number, select: (selection: { initial: number; index: number }) => void) {
  useEffect(() => {
    const targets = new Map<string, number>();
    panels.forEach((panel, index) => {
      const tree = isValidElement<PanelProps>(panel) && panel.props.node;
      if (tree) visit(tree, "element", node => {
        const id = node.properties.id;
        if (typeof id === "string" && /^(section-|section$|article-section-)/.test(id)) {
          targets.set(`#${encodeURIComponent(id)}`, index);
        }
      });
    });
    let frame = 0;
    function reveal() {
      const hash = window.location.hash;
      const index = targets.get(hash);
      if (index === undefined) return;
      select({ initial, index });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView());
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => {
      window.removeEventListener("hashchange", reveal);
      cancelAnimationFrame(frame);
    };
  }, [panels, initial, select]);
}

function tabStyles(accent: string | undefined, radius: number | undefined) {
  const rgb = accent
    ? [1, 3, 5]
        .map((start) => parseInt(accent.slice(start, start + 2), 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        )
    : null;
  const ink =
    rgb && rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
      ? "#151515"
      : "#ffffff";
  const style = {
    ...(accent ? { "--tabs-accent": accent, "--tabs-ink": ink } : {}),
    ...(radius !== undefined ? { "--tabs-radius": `${radius}px` } : {}),
  } as CSSProperties;
  return style;
}
