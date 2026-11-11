import { z } from "zod";
const label = z.string().trim().min(1).max(160);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const point = z.tuple([
  z.number().finite().min(0).max(1000),
  z.number().finite().min(0).max(1000),
]);
export const illustrationFlowSchema = z
  .object({
    title: label,
    description: z.string().trim().min(1).max(2000),
    landmarks: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(40),
            x: z.number().min(0).max(1000),
            y: z.number().min(0).max(1000),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    secondsPerStep: z.number().finite().min(2).max(12).default(4),
    steps: z
      .array(
        z
          .object({
            label,
            description: z.string().trim().min(1).max(2000),
            points: z.array(point).min(2).max(40),
            color,
            endColor: color.optional(),
            region: label.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export type IllustrationFlowSpec = z.infer<typeof illustrationFlowSchema>;
export type FlowStep = IllustrationFlowSpec["steps"][number];

export function validateFlow(
  flow: IllustrationFlowSpec | undefined,
  width: number,
  height: number,
  ids: Set<string>,
  ctx: z.RefinementCtx,
) {
  flow?.landmarks.forEach((mark, index) => {
    if (mark.x > width || mark.y > height)
      ctx.addIssue({
        code: "custom",
        path: ["flow", "landmarks", index],
        message: "Keep landmarks within the illustration.",
      });
  });
  flow?.steps.forEach((step, index) => {
    const path = ["flow", "steps", index];
    if (step.region && !ids.has(step.region))
      ctx.addIssue({
        code: "custom",
        path,
        message: "Flow steps must reference an existing region.",
      });
    if (step.points.some(([x, y]) => x > width || y > height))
      ctx.addIssue({
        code: "custom",
        path,
        message: "Keep flow points inside the illustration dimensions.",
      });
    if (
      step.points.some(
        (point, i) => i > 0 && samePoint(point, step.points[i - 1]),
      )
    )
      ctx.addIssue({
        code: "custom",
        path,
        message: "Consecutive flow points must differ.",
      });
    if (
      index > 0 &&
      !samePoint(step.points[0], flow.steps[index - 1].points.at(-1)!)
    )
      ctx.addIssue({
        code: "custom",
        path,
        message: "Each flow step must start where the previous step ends.",
      });
  });
}
function samePoint(a: number[], b: number[]) {
  return a[0] === b[0] && a[1] === b[1];
}
