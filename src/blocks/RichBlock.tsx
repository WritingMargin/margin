import {
Component,
lazy,
Suspense,
useEffect,
useMemo,
useRef,
useState,
type ReactNode,
} from "react";
import Chart from "./Chart";
import Illustration from "./Illustration";
import Poll from "./Poll";
import "./blocks.css";
import { parseBlock,type BlockLanguage } from "./schema";

const Scene = lazy(() => import("./Scene"));
const Diagram = lazy(() => import("./Diagram"));
class BlockBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="block-error" role="status">
        This interactive block could not load. Reload to try again.
      </p>
    ) : (
      this.props.children
    );
  }
}
export default function RichBlock({
  language,
  source,
}: {
  language: BlockLanguage;
  source: string;
}) {
  const host = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  // Keep valid specs stable during unrelated editor/reader updates.
  const parsed = useMemo(() => {
    try {
      return { block: parseBlock(language, source), error: "" };
    } catch (error) {
      return { block: null, error: (error as Error).message };
    }
  }, [language, source]);
  useEffect(() => {
    if (visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  const block = parsed.block;
  const { title, description, kicker } = blockPresentation(block, language);
  return (
    <section ref={host} className="rich-block" aria-label={title}>
      <div className="block-heading">
        <span className="block-kicker">{kicker}</span>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {parsed.error ? (
        <p className="block-error" role="status">
          {parsed.error}
        </p>
      ) : block && (visible || eagerBlock(block)) ? (
        <BlockBoundary key={language + source}>
          <Suspense
            fallback={
              <p className="block-hint" role="status">
                Loading interactive content…
              </p>
            }
          >
            {block.kind === "illustration" ? (
              <Illustration spec={block.spec} />
            ) : block.kind === "poll" ? (
              <Poll spec={block.spec} />
            ) : block.kind === "chart" ? (
              <Chart spec={block.spec} />
            ) : block.kind === "scene" ? (
              <Scene spec={block.spec} />
            ) : (
              <Diagram source={block.source} />
            )}
          </Suspense>
        </BlockBoundary>
      ) : (
        <p className="block-hint">Interactive content loads as you scroll.</p>
      )}
    </section>
  );
}

function eagerBlock(block: ReturnType<typeof parseBlock>) {
  return block.kind === "illustration" || block.kind === "poll";
}

function blockPresentation(
  block: ReturnType<typeof parseBlock> | null,
  language: BlockLanguage,
) {
  return {
    title:
      block && block.kind !== "mermaid"
        ? block.spec.title
        : language === "mermaid"
          ? "Diagram"
          : "Interactive block",
    description:
      block && block.kind !== "mermaid" ? block.spec.description : undefined,
    kicker: {
      illustration: "INTERACTIVE ATLAS",
      poll: "READER POLL",
      chart: "INTERACTIVE DATA",
      scene: "EXPLORE IN 3D",
      mermaid: "SYSTEM DIAGRAM",
    }[language],
  };
}
