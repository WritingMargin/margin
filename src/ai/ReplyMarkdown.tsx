import { createContext, useContext, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { linkURL } from "../../shared/link-preview";

type SceneRenderer = (source: string) => ReactNode;
const SceneRenderContext = createContext<SceneRenderer | undefined>(undefined);

const ReplyCode: Components["pre"] = ({ node, children }) => {
  const renderScene = useContext(SceneRenderContext);
  const code = node?.children[0];
  if (
    renderScene &&
    code?.type === "element" &&
    code.tagName === "code" &&
    Array.isArray(code.properties.className) &&
    code.properties.className.includes("language-scene")
  ) {
    const source = code.children
      .map((child) => (child.type === "text" ? child.value : ""))
      .join("")
      .trim();
    return renderScene(source);
  }
  return (
    <pre tabIndex={0} aria-label="Code block">
      {children}
    </pre>
  );
};

const replyComponents: Components = {
  a: ({ href, children }) => {
    const url = href && linkURL(href);
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    );
  },
  // Text descriptions remain readable without requesting a remote image.
  img: ({ alt }) => alt || null,
  table: ({ children }) => (
    <div
      className="md-table-wrap"
      role="region"
      aria-label="Table"
      tabIndex={0}
    >
      <table>{children}</table>
    </div>
  ),
  pre: ReplyCode,
};

export default function ReplyMarkdown({
  content,
  compact = false,
  renderScene,
}: {
  content: string;
  compact?: boolean;
  renderScene?: SceneRenderer;
}) {
  return (
    <div
      className={
        "markdown-body reply-markdown " +
        (compact ? "reply-markdown-compact" : "chat-reply-text")
      }
    >
      <SceneRenderContext.Provider value={renderScene}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={replyComponents}
          skipHtml
        >
          {content}
        </ReactMarkdown>
      </SceneRenderContext.Provider>
    </div>
  );
}
