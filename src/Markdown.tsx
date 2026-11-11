import checklists from "./markdown/checklists";
import { ChecklistHost } from "./blocks/ChecklistHost";
import { expandCitations } from "../shared/citations";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { expandContentTags } from "../shared/content-tags";
import fontMarkup from "../shared/font-markup";
import { taggedExample } from "./blocks/examples";
import { markdownSchema } from "./markdown-schema";
import "./markdown.css";
import { markdownComponents } from "./markdown/components";
import socialPosts from "./social/remark-social-posts";
import styledDirectives from "./markdown/directives";
import tableOfContentsPlugin from "./markdown/table-of-contents";
import type { TableOfContentsDesign } from "../shared/table-of-contents";
import type { Post } from "../shared/types";
import "./markdown/table-of-contents.css";

export { safeMediaUrl } from "./media";

export default function Markdown({ content, tableOfContents, contentsDesign, floatingChecklists = false }: { floatingChecklists?: boolean; content: string; tableOfContents?: Post["tableOfContents"]; contentsDesign?: TableOfContentsDesign }) {
  return (
    <ChecklistHost key={content} enabled={floatingChecklists}>
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkDirective,
          fontMarkup,
          styledDirectives,
          socialPosts,
        ]}
        rehypePlugins={[[rehypeSanitize, markdownSchema], checklists, [tableOfContentsPlugin, { placement: tableOfContents, design: contentsDesign }]]}
        skipHtml
        components={markdownComponents}
      >
        {expandCitations(expandContentTags(content))}
      </ReactMarkdown>
    </div>
    </ChecklistHost>
  );
}

export const seedContent = `Technical ideas are easier to understand when readers can explore them. Combine prose, code, data, and interactive scenes in the same post.

## Measure the difference

A cache changes how response time grows with traffic. Toggle a series, switch the chart style, or inspect the underlying data.
${taggedExample("chart")}
## Follow the request

Describe the system as a diagram that stays editable alongside the explanation.
${taggedExample("mermaid")}
## Make the model tangible

Use geometry to explain spatial relationships. Drag to orbit, zoom in, and select an object to inspect it.
${taggedExample("scene")}
:::callout{tone="tip"}
**Write with an AI agent**

Ask your agent to generate chart or scene JSON blocks, or Mermaid diagrams. The same Markdown works in the editor and through the CLI. Use the interactive block button to insert another example.
:::
`;
