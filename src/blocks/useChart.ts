import { useId,useState } from "react";
import { palette } from "./chart-format";
import type { ChartSpec } from "./schema";
export function useChart({ spec }: { spec: ChartSpec }) {
  const id = useId();
  const [type, setType] = useState(spec.type);
  const [hidden, setHidden] = useState<string[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const visible = spec.series
    .map((s, i) => ({ ...s, color: s.color || palette[i] }))
    .filter((s) => !hidden.includes(s.name));
  const values = visible.flatMap((s) => s.values);
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  const span = max - min || 1;
  const bottom = 264,
    top = 24,
    left = 72,
    width = 540;
  const x = (i: number) => left + (width * (i + 0.5)) / spec.labels.length;
  const y = (value: number) => bottom - ((value - min) / span) * (bottom - top);
  const groupWidth = (width / spec.labels.length) * 0.76;
  return {
    spec,
    id,
    type,
    setType,
    hidden,
    setHidden,
    active,
    setActive,
    visible,
    values,
    min,
    max,
    span,
    bottom,
    top,
    left,
    width,
    x,
    y,
    groupWidth,
  };
}
export type ChartController = ReturnType<typeof useChart>;
