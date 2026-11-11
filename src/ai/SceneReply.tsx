import { lazy, Suspense, useMemo, useState } from "react";
import { taggedBlock } from "../../shared/content-tags";
import { parseBlock } from "../blocks/schema";

const RichBlock = lazy(() => import("../blocks/RichBlock"));

export default function SceneReply({
  source,
  copied,
  copy,
}: {
  source: string;
  copied: boolean;
  copy: (value: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const problem = useMemo(() => {
    try {
      const block = parseBlock("scene", source);
      if (block.kind !== "scene") return "Expected a 3D scene.";
      if (
        block.spec.poster ||
        block.spec.objects.some((object) => object.shape === "model")
      )
        return "Ask for an animation using built-in shapes so the scene can be copied without external assets.";
      if (!block.spec.objects.some((object) => object.keyframes?.length))
        return "Ask for timed position or rotation keyframes to animate this scene.";
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  }, [source]);
  const markdown = taggedBlock("scene", source).trim();
  return (
    <section aria-label="Generated 3D animation">
      {problem ? (
        <p role="status">{problem}</p>
      ) : (
        <>
          <button
            type="button"
            className="chat-copy"
            aria-expanded={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Hide preview" : "Preview animation"}
          </button>{" "}
          <button
            type="button"
            className="chat-copy"
            onClick={() => copy(markdown)}
          >
            {copied ? "Copied" : "Copy animation"}
          </button>
          {preview && (
            <Suspense fallback={<p role="status">Loading animation…</p>}>
              <RichBlock language="scene" source={source} />
            </Suspense>
          )}
        </>
      )}
      <details open={problem ? true : undefined}>
        <summary>Animation source</summary>
        <pre tabIndex={0}>
          <code>{markdown}</code>
        </pre>
      </details>
    </section>
  );
}
