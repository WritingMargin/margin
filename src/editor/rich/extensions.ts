import {
  Extension,
  Node,
  mergeAttributes,
  textblockTypeInputRule,
  wrappingInputRule,
} from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import MarginComponentView from "./MarginComponentView";
import { MARGIN_COMPONENT } from "./markdown";

/**
 * An atomic block that renders a custom component exactly like the reader
 * (chart, diagram, media, tabs, callout, columns, …) and keeps its raw source
 * byte-for-byte so it can be edited in the settings dialog.
 */
export const MarginComponent = Node.create({
  name: MARGIN_COMPONENT,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      src: { default: "" },
      label: { default: "Component" },
      kind: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-margin-component]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-margin-component": "" }, HTMLAttributes),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MarginComponentView, {
      // Let the rendered component handle its own pointer and keyboard events
      // (tabs, polls, players, links) instead of the editor selecting the node.
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        return !!target?.closest(".margin-component-frame");
      },
    });
  },
});

/**
 * Markdown typing shortcuts for the rich editor: `# ` for headings, `> ` for
 * quotes, `- ` / `1. ` for lists, and ``` ``` ``` for code blocks. Emphasis,
 * code, links, and strikes are already covered by StarterKit input rules.
 */
export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",
  addInputRules() {
    const { nodes } = this.editor.schema;
    return [
      textblockTypeInputRule({
        find: /^(#{1,6})\s$/,
        type: nodes.heading,
        getAttributes: (match) => ({ level: match[1].length }),
      }),
      wrappingInputRule({ find: /^>\s$/, type: nodes.blockquote }),
      wrappingInputRule({
        find: /^([-+*])\s$/,
        type: nodes.bulletList,
      }),
      wrappingInputRule({
        find: /^(\d+)\.\s$/,
        type: nodes.orderedList,
        getAttributes: (match) => ({ start: Number(match[1]) }),
      }),
      textblockTypeInputRule({
        find: /^```([a-z0-9+#-]*)\s$/,
        type: nodes.codeBlock,
        getAttributes: (match) => ({ language: match[1] || null }),
      }),
    ];
  },
});
