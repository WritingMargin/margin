import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { chartSchema, sceneSchema, pollSchema, blockLanguages, maxBlockCharacters, parseBlock } from "../src/blocks/schema.ts";
import { illustrationSchema } from "../src/blocks/illustration-schema.ts";
import { blockExamples } from "../src/blocks/examples.ts";
import { codeLanguages } from "../shared/code-languages.ts";
import { designSchema } from "../shared/design-config.ts";
import { defaultTheme } from "../shared/types.ts";
import { contentTags } from "../shared/content-tags.ts";

// Zod refinements cannot be expressed fully in JSON Schema. Ship their authoring
// constraints alongside the structural schema; never imply schema-only validity.
const rules: Record<string, string[]> = {
  chart: ["Every series must have exactly one value per label.", "Series names must be unique after trimming.", "Labels are evenly spaced categories, not proportional numeric coordinates.", "Use real measured data or explicitly label illustrative values."],
  mermaid: ["Start with the diagram type; empty definitions are invalid.", "No %%{...} configuration directives or YAML frontmatter.", "Renderer uses strict security; do not use HTML, scripts or click callbacks.", "At most 300 edges; review syntax and layout in the Mermaid renderer."],
  scene: ["Only shape=model accepts src and animationSrc. It requires src. Optional animationSrc points to a self-contained Three.js transform clip JSON targeting this model.", "Model src must be an HTTPS or root-relative .glb, .gltf, .obj or .stl URL without credentials.", "Use a self-contained file up to 20 MiB. GLB/glTF 2.0 supports embedded clips, up to 1000 nodes and 2000000 accessor elements. Embed glTF JSON resources as base64. Required extensions and external resources are unsupported. OBJ and STL provide static geometry. Remote hosts need CORS and an allowed model origin.", "Poster src must be HTTPS or root-relative without credentials; alt must be non-empty.", "Each keyframe specifies time in seconds (strictly increasing from above 0 up to 120) and position or rotation or both. Start from the object pose at time 0. Animated objects share one looping clip.", "Rotations use radians. Pulse is illustrative scaling, not imported animation playback."],
  illustration: ["Supply shapes or artwork with a hosted image src and non-empty alt. Regions use the drawing coordinate system.", "Region IDs must be unique after trimming.", "Shape and flow region references must match an existing region ID.", "Markers, flow points and landmarks must remain inside width and height.", "Consecutive flow points must differ. Each step must begin at the previous step's endpoint.", "Paths contain SVG geometry, never SVG markup, URLs, styles or event handlers.", "Poster src must be HTTPS or root-relative without credentials; alt must be non-empty."],
  poll: ["Keep a poll ID stable across edits so each signed-in reader gets one vote.", "Multiple-choice polls need two to eight uniquely identified options.", "Agree/disagree polls use fixed agree and disagree options; allowReason lets a reader send an optional private reason visible to the writer in poll results.", "Set resultsVisibility to after-vote (default) or after-close. After-close requires closesAt as an RFC3339 date and time with a timezone. A closesAt value also closes an after-vote poll at that time."],
};
const schemas = { chart: chartSchema, scene: sceneSchema, illustration: illustrationSchema, poll: pollSchema };
const blocks = blockLanguages.map(language => {
  const example = blockExamples.find(example => example.language === language)!;
  parseBlock(language, example.source);
  return {
    language, title: example.title, description: example.description,
    maxCharacters: maxBlockCharacters,
    schema: language === "mermaid" ? undefined : z.toJSONSchema(schemas[language], { io: "input" }),
    rules: rules[language], example: example.source,
  };
});
const catalog = { formatVersion: 1, codeLanguages: codeLanguages.map(([language]) => language), tags: Object.keys(contentTags), blocks };
const output = JSON.stringify(catalog, null, 2) + "\n";
const file = new URL("../cli/skills/margin-authoring/references/blocks.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(file, "utf8") !== output) throw new Error("Authoring catalog is stale. Run npm run generate:authoring.");
  console.log("Authoring schemas and examples are valid and up to date.");
} else {
  await writeFile(file, output);
  console.log(`Generated authoring catalog (${blocks.length} interactive blocks).`);
}

const designOutput = JSON.stringify({ formatVersion: 1, format: "Margin storage/API design JSON (not the grouped editor export)", schema: z.toJSONSchema(designSchema, { io: "input" }), defaults: designSchema.parse(defaultTheme) }, null, 2) + "\n";
const designFile = new URL("../cli/skills/margin-authoring/references/design.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(designFile, "utf8") !== designOutput) throw new Error("Design catalog is stale. Run npm run generate:authoring.");
  console.log("Design schema and defaults are valid and up to date.");
} else {
  await writeFile(designFile, designOutput);
  console.log("Generated design schema and defaults.");
}
