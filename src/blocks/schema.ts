import { blockPosterSchema } from "./block-poster";
import { z } from "zod";
import { modelUrlHint, safeModelUrl, safeClipUrl } from "./scene-model-format";
import {
  illustrationSchema,
  type IllustrationSpec,
} from "./illustration-schema";

const label = z.string().trim().min(1).max(160);
const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color, such as #608a73.");
const number = z.number().finite().min(-1e12).max(1e12);
const vector = z.tuple([
  z.number().min(-50).max(50),
  z.number().min(-50).max(50),
  z.number().min(-50).max(50),
]);
const sceneKeyframes = z.array(z.object({
  time: z.number().positive().max(120),
  position: vector.optional(),
  rotation: vector.optional(),
}).strict().refine(frame => !!(frame.position || frame.rotation), "Give each keyframe a position or rotation."))
  .min(1).max(32)
  .refine(frames => frames.every((frame, i) => i === 0 || frame.time > frames[i - 1].time), "Keyframe times must increase.");
const description = z.string().max(2000).optional();
const pollId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Use a stable lowercase poll ID.");
export const pollSchema = z.object({
  id: pollId,
  title: label,
  description,
  type: z.enum(["multiple-choice", "agree-disagree"]),
  options: z.array(z.object({ id: pollId, label }).strict()).min(2).max(8).optional(),
  allowReason: z.boolean().optional(),
  resultsVisibility: z.enum(["after-vote", "after-close"]).optional(),
  closesAt: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((poll, ctx) => {
  if (poll.type === "multiple-choice" && !poll.options)
    ctx.addIssue({ code: "custom", path: ["options"], message: "Multiple-choice polls need two to eight options." });
  if (poll.type === "agree-disagree" && poll.options)
    ctx.addIssue({ code: "custom", path: ["options"], message: "Agree/disagree polls have fixed options." });
  if (poll.type === "multiple-choice" && poll.allowReason)
    ctx.addIssue({ code: "custom", path: ["allowReason"], message: "Reasons are available on agree/disagree polls." });
  if (poll.options && new Set(poll.options.map(option => option.id)).size !== poll.options.length)
    ctx.addIssue({ code: "custom", path: ["options"], message: "Poll option IDs must be unique." });
}).superRefine((poll, ctx) => {
  if (poll.resultsVisibility === "after-close" && !poll.closesAt)
    ctx.addIssue({ code: "custom", path: ["closesAt"], message: "Set a close date and time to reveal results after voting closes." });
});

export const chartSchema = z
  .object({
    title: label,
    description,
    type: z.enum(["line", "bar", "area"]).default("line"),
    xLabel: label.optional(),
    yLabel: label.optional(),
    labels: z.array(label).min(1).max(200),
    series: z
      .array(
        z
          .object({
            name: label,
            values: z.array(number).min(1).max(200),
            color: color.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .superRefine((chart, ctx) => {
    chart.series.forEach((series, i) => {
      if (series.values.length !== chart.labels.length)
        ctx.addIssue({
          code: "custom",
          path: ["series", i, "values"],
          message: "Each series needs one value per label.",
        });
    });
    if (new Set(chart.series.map((s) => s.name)).size !== chart.series.length)
      ctx.addIssue({
        code: "custom",
        path: ["series"],
        message: "Series names must be unique.",
      });
  });

export const sceneSchema = z
  .object({
    title: label,
    poster: blockPosterSchema.optional(),
    description,
    background: color.default("#f5f7f4"),
    autoRotate: z.boolean().default(false),
    objects: z
      .array(
        z
          .object({
            shape: z.enum([
              "box",
              "sphere",
              "torus",
              "cone",
              "cylinder",
              "model",
            ]),
            src: z
              .string()
              .max(2000)
              .refine(safeModelUrl, modelUrlHint)
              .optional(),
            keyframes: sceneKeyframes.optional(),
            animationSrc: z.string().max(2000).refine(safeClipUrl, "Use an HTTPS or root-relative .json clip URL.").optional(),
            pulse: z
              .object({
                bpm: z.number().finite().min(30).max(180).default(72),
                amplitude: z
                  .number()
                  .finite()
                  .min(0.01)
                  .max(0.15)
                  .default(0.07),
              })
              .strict()
              .optional(),
            label: label,
            description,
            color: color.default("#648774"),
            position: vector.default([0, 0, 0]),
            rotation: vector.default([0, 0, 0]),
            scale: z.number().min(0.1).max(10).default(1),
          })
          .strict()
          .superRefine((object, ctx) => {
            if (object.shape === "model" && !object.src)
              ctx.addIssue({
                code: "custom",
                path: ["src"],
                message: "A model needs a source URL.",
              });
            if (object.shape !== "model" && (object.src || object.animationSrc))
              ctx.addIssue({
                code: "custom",
                path: ["src"],
                message: "Only model objects accept a source URL.",
              });
          }),
      )
      .min(1)
      .max(40),
  })
  .strict();

export const blockLanguages = [
  "chart",
  "mermaid",
  "scene",
  "illustration",
  "poll",
] as const;
export type BlockLanguage = (typeof blockLanguages)[number];
export type ChartSpec = z.infer<typeof chartSchema>;
export type SceneSpec = z.infer<typeof sceneSchema>;
export type PollSpec = z.infer<typeof pollSchema>;
export type BlockSpec =
  | { kind: "illustration"; spec: IllustrationSpec }
  | { kind: "chart"; spec: ChartSpec }
  | { kind: "scene"; spec: SceneSpec }
  | { kind: "poll"; spec: PollSpec }
  | { kind: "mermaid"; source: string };

export const maxBlockCharacters = 50_000;

export function parseBlock(language: BlockLanguage, source: string): BlockSpec {
  if (source.length > maxBlockCharacters)
    throw new Error("Keep interactive blocks under 50,000 characters.");
  if (language === "mermaid") return parseDiagram(source);
  const value = parseBlockJSON(source);
  if (language === "illustration") return parseIllustration(value);
  if (language === "poll") return parsePoll(value);
  return parseChartOrScene(language, value);
}

function parseBlockJSON(source: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(
      "This block needs valid JSON. Check commas, double quotes, and brackets.",
    );
  }
  return value;
}
function parseIllustration(value: unknown): BlockSpec {
  const result = illustrationSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0].message);
  return { kind: "illustration", spec: result.data };
}
function parsePoll(value: unknown): BlockSpec {
  const result = pollSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${issue.path.join(".") || "Poll"}: ${issue.message}`);
  }
  return { kind: "poll", spec: result.data };
}
function parseChartOrScene(language: "chart" | "scene", value: unknown): BlockSpec {
  const result = (language === "chart" ? chartSchema : sceneSchema).safeParse(
    value,
  );
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${issue.path.join(".") || "Block"}: ${issue.message}`);
  }
  return language === "chart"
    ? { kind: "chart", spec: result.data as ChartSpec }
    : { kind: "scene", spec: result.data as SceneSpec };
}

function parseDiagram(source: string): BlockSpec {
  if (!source.trim()) throw new Error("Add a Mermaid diagram definition.");
  // Configuration belongs to the renderer, never to generated post content.
  if (/%%\s*\{|^\s*---/m.test(source))
    throw new Error(
      "Mermaid configuration directives and frontmatter are not supported. Start with the diagram type.",
    );
  return { kind: "mermaid", source };
}
