import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { safeMediaUrl } from "../media";
import "../markdown.css";

// Generated summaries use ordinary Markdown. Rich article blocks and directives
// must never be interpreted as interactive content from an AI response.
export default function SimplifiedContent({ content }: { content: string }) {
  return <div className="markdown-body">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      skipHtml
      components={{
        a: ({ href, children }) => <a href={href} rel="noopener noreferrer">{children}</a>,
        img: ({ src, alt, title }) => {
          const safe = safeMediaUrl(src);
          return safe ? <img src={safe} alt={alt || ""} title={title} loading="lazy" /> : null;
        },
        table: ({ children }) => <div className="md-table-wrap"><table>{children}</table></div>,
      }}
    >{content}</ReactMarkdown>
  </div>;
}
