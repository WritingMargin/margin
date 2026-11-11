import { checklistExample } from "../../shared/checklist";
import { taggedBlock, modelTag, figmaTag } from "../../shared/content-tags";
import { tabsExample } from "../../shared/tabs";
import { blockExamples } from "../blocks/examples";
import { ChevronDown } from "lucide-react";
export default function SyntaxGuide() {
  return (
    <>
      <header className="dialog-header">
        <span className="eyebrow">A SMALL GUIDE TO BIG IDEAS</span>
        <h2>A little more than Markdown.</h2>
      </header>
      <div className="dialog-body">
        <p>
          Type [ for tags or / on an empty line for commands. Start [Font=" to
          choose a typeface, or add a space after a tag name to see its
          properties. Use ↑/↓ to browse suggestions, Enter or Tab to insert, and
          Escape to dismiss. Put block tags on their own lines; nest tags to
          group content. Existing Markdown directives and code fences still
          work. Paste an X, Instagram or LinkedIn post URL on its own paragraph
          to create a card. Readers choose when to load the embed.
        </p>
        <div className="syntax-guide">
          {[
            [
              "Social post",
              '[Social url="https://x.com/username/status/123456789" title="A post worth reading"]',
            ],
            ["Headings", "## Your heading"],
            [
              "Citation",
              '[Citation url="https://example.com/article" title="Source title" quote="Exact words in the source"]Your text[/Citation]',
            ],
            [
              "PDF citation",
              '[Citation url="https://example.com/report.pdf" title="Report" page="12"]Quoted passage[/Citation]',
            ],
            [
              "Emphasis",
              "**Bold**, _italic_, [Highlight]highlight[/Highlight]",
            ],
            ["Inline font", '[Font="Caveat"]A handwritten thought[/Font]'],
            [
              "Section font",
              '[Font="Source Serif 4"]\n\n## A different voice\n\nMarkdown works inside the section.\n\n[/Font]',
            ],
            [
              "Callout",
              '[Callout tone="note"]\nA thought worth keeping.\n[/Callout]',
            ],
            [
              "Framed image",
              '[Image src="https://…" frame="border" caption="A quiet moment"]',
            ],
            [
              "Video",
              '[Video src="https://www.youtube.com/watch?v=VIDEO_ID" frame="border" caption="Watch the walkthrough"]',
            ],
            ["3D model with animation", modelTag("/assets/model.glb", "Assembly", "/assets/animation.json")],
            ["Live Figma design", figmaTag("https://www.figma.com/design/FILEKEY", "Design")],
            ["Horizontal tabs", tabsExample("horizontal")],
            ["Vertical tabs", tabsExample("vertical")],
            ["Interactive checklist", checklistExample(true)],
            ["Task list", "- [x] One good idea\n- [ ] Make it happen"],
            ...blockExamples.map((example) => [
              example.title,
              taggedBlock(example.language, example.source),
            ]),
          ].map(([a, b]) => (
            <details key={a}>
              <summary>
                <span>{a}</span>
                <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
              </summary>
              <pre>{b}</pre>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
