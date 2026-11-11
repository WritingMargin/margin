import { useState } from "react";
import { tabOptions,type TabsOptions } from "../../shared/tabs";
import "./tabs-picker.css";

export function useTabsPicker({
  onInsert,
}: {
  onInsert: (content: string) => void;
}) {
  const [title, setTitle] = useState("Explore the idea");
  const [options, setOptions] = useState<TabsOptions>(
    tabOptions({ radius: "6" }),
  );
  const [panels, setPanels] = useState([
    {
      title: "Overview",
      content:
        "## The big picture\n\nIntroduce your idea here. Each tab supports **Markdown**, media, and interactive blocks.",
    },
    {
      title: "Details",
      content:
        "## A closer look\n\n- Add a useful detail.\n- Explain how it works.\n- Share an example.",
    },
    {
      title: "Takeaways",
      content: "> Leave your reader with something worth remembering.",
    },
  ]);
  const [editing, setEditing] = useState(0);
  const [previewTab, setPreviewTab] = useState(1);
  const update = (value: Partial<TabsOptions>) =>
    setOptions((current) => ({ ...current, ...value }));
  const changePanel = (value: Partial<(typeof panels)[number]>) =>
    setPanels((current) =>
      current.map((panel, index) =>
        index === editing ? { ...panel, ...value } : panel,
      ),
    );
  const selectPanel = (index: number) => {
    setEditing(index);
    setPreviewTab(index + 1);
  };
  const move = (offset: number) => {
    const target = editing + offset;
    if (target < 0 || target >= panels.length) return;
    const next = [...panels];
    [next[target], next[editing]] = [next[editing], next[target]];
    if (options.initial === editing + 1) update({ initial: target + 1 });
    else if (options.initial === target + 1) update({ initial: editing + 1 });
    setPanels(next);
    selectPanel(target);
  };
  const remove = () => {
    if (panels.length === 1) return;
    const next = panels.filter((_, index) => index !== editing);
    setPanels(next);
    selectPanel(Math.min(editing, next.length - 1));
    update({
      initial: Math.max(
        1,
        Math.min(
          options.initial - (editing + 1 < options.initial ? 1 : 0),
          next.length,
        ),
      ),
    });
  };
  const invalid = !title.trim() || panels.some((panel) => !panel.title.trim());
  return {
    onInsert,
    title,
    setTitle,
    options,
    panels,
    setPanels,
    editing,
    previewTab,
    setPreviewTab,
    update,
    changePanel,
    selectPanel,
    move,
    remove,
    invalid,
  };
}
export type TabsPickerController = ReturnType<typeof useTabsPicker>;
