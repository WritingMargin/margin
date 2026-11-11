import { useState } from "react";
import { type WidgetWidth } from "./layout";

export function useBlockPicker({
  onInsert,
}: {
  onInsert: (content: string) => void;
}) {
  const [width, setWidth] = useState<WidgetWidth>("full");
  const [height, setHeight] = useState("auto");
  const [align, setAlign] = useState("center");
  const [wrap, setWrap] = useState(false);
  return {
    onInsert,
    width,
    setWidth,
    height,
    setHeight,
    align,
    setAlign,
    wrap,
    setWrap,
  };
}
export type BlockPickerController = ReturnType<typeof useBlockPicker>;
