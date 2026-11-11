import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { designReferenceSchema, describeDesignValue, type FieldSchema } from "../../shared/design-reference";
import { defaultHeroSection } from "../../shared/template-sections";
export type JSONNode = ReturnType<typeof syntaxTree>["topNode"];
export type Schema = Omit<FieldSchema, "properties"> & {
  const?: unknown; anyOf?: Schema[]; oneOf?: Schema[]; items?: Schema; properties?: Record<string, Schema>;
};
export function readKey(state: EditorState, property: JSONNode): string {
  const key = property.getChild("PropertyName");
  if (!key) return "";
  try { return JSON.parse(state.sliceDoc(key.from, key.to)); } catch { return ""; }
}
export function nodePath(state: EditorState, node: JSONNode): string[] {
  if (node.parent?.name === "Property") return [...nodePath(state, node.parent.parent!), readKey(state, node.parent)];
  if (node.parent?.name === "Array") return [...nodePath(state, node.parent), "[]"];
  return node.parent?.name === "JsonText" ? [] : ["<unsupported>"];
}
function literalProperties(state: EditorState, node: JSONNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const property of node.getChildren("Property")) {
    const value = property.getChild(":")?.nextSibling;
    if (value) { try { result[readKey(state, property)] = JSON.parse(state.sliceDoc(value.from, value.to)); } catch { /* Incomplete input is expected. */ } }
  }
  return result;
}
function mergeAlternatives(options: Schema[]): Schema {
  const properties: Record<string, Schema> = {};
  for (const option of options) for (const [key, value] of Object.entries(option.properties ?? {})) {
    properties[key] = properties[key] ? { anyOf: [properties[key], value] } : value;
  }
  return { type: "object", properties };
}
function resolveObject(schema: Schema, state: EditorState, node: JSONNode): Schema {
  const variants = schema.anyOf ?? schema.oneOf;
  if (!variants) return schema;
  const objects = variants.filter(option => option.type === "object");
  const values = literalProperties(state, node);
  const matches = objects.filter(option => Object.entries(option.properties ?? {}).every(([key, field]) => field.const === undefined || values[key] === undefined || values[key] === field.const));
  if (matches.length === 1) return matches[0];
  return mergeAlternatives(matches);
}
function parentSchema(state: EditorState, node: JSONNode): Schema | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  if (parent.name === "JsonText") return designReferenceSchema as Schema;
  if (parent.name === "Property") return schemaForNode(state, parent.parent!)?.properties?.[readKey(state, parent)];
  if (parent.name === "Array") return schemaForNode(state, parent)?.items;
}
export function schemaForNode(state: EditorState, node: JSONNode): Schema | undefined {
  const schema = parentSchema(state, node);
  return schema && node.name === "Object" ? resolveObject(schema, state, node) : schema;
}
export function valueChoices(schema: Schema): unknown[] {
  if (schema.const !== undefined) return [schema.const];
  if (schema.enum) return schema.enum;
  if (schema.type === "boolean") return [true, false];
  const variants = schema.anyOf ?? schema.oneOf ?? [];
  return [...new Set(variants.flatMap(valueChoices))];
}
export function schemaDescription(schema: Schema): string {
  const choices = valueChoices(schema);
  if (choices.length) return choices.map(value => JSON.stringify(value)).join(" · ");
  if (schema.anyOf) return "Text or a {bind, fallback} object";
  if (schema.type === "object") return "Settings object";
  if (schema.type === "array") return "Ordered components · 1–3 · keep one post-feed";
  if (schema.pattern && schema.pattern !== "^#[a-fA-F0-9]{6}$") return "ID · lowercase letter, then letters, digits, or hyphens · 1–64 characters";
  return describeDesignValue(schema);
}
export function nestedDescription(path: string): string {
  const key = path.split(".").at(-1)!;
  const notes: Record<string, string> = {
    id: "Unique section ID. Use one of each component and keep a post feed.",
    component: "Choose hero, featured-posts, or post-feed. Array order controls page order.",
    variant: "Hero arrangement: split, centered, or an image background.",
    props: "Hero content. Use text directly or bind it to publication or published-post data.",
    source: "Use the latest or featured published post for content bindings.",
    title: "Hero headline: custom text or a text binding.",
    description: "Hero introduction: custom text or a text binding.",
    image: "Hero image: an image URL or an image binding.",
    buttonLabel: "Hero button text: custom text or a text binding.",
    buttonHref: "Button destination: an HTTP(S) URL, site path, anchor, or link binding.",
    bind: "Read this value from your publication or selected published post.",
    fallback: "Use this text when the bound value is empty or unavailable.",
  };
  return path.includes("sections") ? notes[key] ?? "" : "";
}
export function schemaSeed(schema: Schema): unknown {
  if (schema.type === "array") return [{ id: "stories", component: "post-feed" }];
  if (schema.type === "object") return Object.fromEntries((schema.required ?? []).map(key => [key, schemaSeed(schema.properties![key])]));
  const choices = valueChoices(schema);
  if (choices.length) return choices[0];
  if (schema.type === "integer") return schema.minimum ?? 0;
  if (schema.pattern?.startsWith("^#")) return "#242424";
  if (schema.pattern) return "section";
  return "";
}
export const componentExamples = [defaultHeroSection(), { id: "featured", component: "featured-posts" }, { id: "stories", component: "post-feed" }];
