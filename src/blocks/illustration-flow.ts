export type FlowPosition = { step: number; progress: number };
export const initialFlow: FlowPosition = { step: 0, progress: 0 };
export function advanceFlow(
  position: FlowPosition,
  elapsed: number,
  stepCount: number,
): FlowPosition {
  const total = Math.min(
    stepCount,
    position.step + position.progress + Math.max(0, elapsed),
  );
  if (total >= stepCount) return { step: stepCount - 1, progress: 1 };
  return { step: Math.floor(total), progress: total % 1 };
}
export function pointAlongRoute(
  points: [number, number][],
  progress: number,
): [number, number] {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let remaining =
    lengths.reduce((sum, length) => sum + length, 0) *
    Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const fraction = lengths[i] === 0 ? 0 : remaining / lengths[i];
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * fraction,
        points[i][1] + (points[i + 1][1] - points[i][1]) * fraction,
      ];
    }
    remaining -= lengths[i];
  }
  return points.at(-1)!;
}
export function flowColor(start: string, end: string, progress: number) {
  const channels = [1, 3, 5].map((offset) => {
    const a = parseInt(start.slice(offset, offset + 2), 16);
    const b = parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * progress)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}
