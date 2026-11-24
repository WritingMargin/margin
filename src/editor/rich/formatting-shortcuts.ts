import { Extension } from "@tiptap/core";

/** Accept either platform's formatting keys in Notes and the writer's pad. */
export const FormattingShortcuts = Extension.create({
  name: "formattingShortcuts",
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      "Meta-b": () => this.editor.commands.toggleBold(),
      "Meta-B": () => this.editor.commands.toggleBold(),
      "Control-b": () => this.editor.commands.toggleBold(),
      "Control-B": () => this.editor.commands.toggleBold(),
      "Meta-i": () => this.editor.commands.toggleItalic(),
      "Meta-I": () => this.editor.commands.toggleItalic(),
      "Control-i": () => this.editor.commands.toggleItalic(),
      "Control-I": () => this.editor.commands.toggleItalic(),
    };
  },
});
