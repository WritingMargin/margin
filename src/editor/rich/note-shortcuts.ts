import { Extension } from "@tiptap/core";

// Keep the full schema so existing notes remain intact, but don't offer the
// writer's extra formatting commands while taking a note.
export const NoteShortcuts = Extension.create({
  name: "noteShortcuts",
  priority: 1000,
  addKeyboardShortcuts() {
    const shortcuts = [
      "Mod-u", "Mod-U", "Mod-e", "Mod-Shift-s",
      "Mod-Shift-b", "Mod-Shift-7", "Mod-Shift-8", "Mod-Alt-c",
      ...[1, 2, 3, 4, 5, 6].map(level => `Mod-Alt-${level}`),
    ];
    return Object.fromEntries(shortcuts.map(shortcut => [shortcut, () => true]));
  },
});
