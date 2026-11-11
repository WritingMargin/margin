import { syntaxTree } from "@codemirror/language";
import { insertCompletionText, pickedCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { designReference } from "../../shared/design-reference";
import { designGroupNotes, groupDesign, readDesignPath } from "../../shared/design-groups";
import { defaultTheme } from "../../shared/types";

import { componentExamples, nestedDescription, nodePath, readKey, schemaDescription, schemaForNode, schemaSeed, valueChoices, type JSONNode as Node, type Schema } from "./json-schema-context";
const fields = new Map(designReference.flatMap(group => group.fields.map(field => [field.path, field] as const)));
const groupedDefaults = groupDesign(defaultTheme);
function objectAt(state: EditorState, pos: number): Node | null {
  let node: Node | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (["Object", "Array"].includes(node.name) && node.from < pos && (pos < node.to || !["}", "]"].includes(node.lastChild?.name ?? ""))) return node;
    node = node.parent;
  }
  return null;
}
function fieldInfo(path: string, schema: Schema) {
  const field = fields.get(path);
  const description = field?.description ?? schema.description ?? designGroupNotes[path] ?? nestedDescription(path);
  const values = schemaDescription(schema);
  return { description, info: `${description}\n${values}`, detail: values };
}
function seedValue(path: string, schema: Schema): unknown {
  const initial = fields.get(path)?.initial;
  if (initial !== undefined) return initial;
  const group = readDesignPath(groupedDefaults, path.split("."));
  if (group !== undefined && (typeof group !== "object" || Object.keys(group as object).length)) return group;
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, child]) => [key, seedValue(`${path}.${key}`, child)]));
  return schemaSeed(schema);
}

export type DesignCompletion = Completion & { description: string };
function propertyCompletion(key: string, path: string[], schema: Schema, keyOnly: boolean): DesignCompletion {
  const fullPath = [...path, key].join(".");
  const meta = fieldInfo(fullPath, schema);
  return {
    label: JSON.stringify(key), displayLabel: key, type: "property", ...meta, info: undefined,
    apply(view, completion, from, to) {
      const name = JSON.stringify(key);
      const indent = view.state.doc.lineAt(from).text.match(/^\s*/)?.[0] ?? "";
      const value = JSON.stringify(seedValue(fullPath, schema), null, 2).replace(/\n/g, `\n${indent}`);
      const suffix = view.state.sliceDoc(to).trimStart();
      const comma = !keyOnly && suffix.startsWith('"') ? "," : "";
      const insert = keyOnly ? name : `${name}: ${value}${comma}`;
      const transaction = insertCompletionText(view.state, insert, from, to);
      // Place the caret in the inserted value so its choices can open immediately.
      if (!keyOnly) transaction.selection = { anchor: from + name.length + 2 + (value.startsWith('"') ? 1 : 0) };
      view.dispatch({ ...transaction, annotations: pickedCompletion.of(completion) });
    },
  };
}
function propertyRange(context: CompletionContext, property?: Node) {
  const name = property?.getChild("PropertyName");
  const token = context.matchBefore(/"?(?:[\w-]|\\.)*"?$/);
  const from = name?.from ?? token?.from ?? context.pos;
  const to = name?.to ?? context.pos;
  return { name, from, to };
}
function hasOwnColon(state: EditorState, property?: Node): boolean {
  const name = property?.getChild("PropertyName"), colon = property?.getChild(":");
  return !!name && !!colon && state.sliceDoc(name.to, colon.from).trim() === "";
}
function propertyResult(context: CompletionContext, object: Node, path: string[], schema: Schema, property?: Node): CompletionResult | null {
  const { name, from, to } = propertyRange(context, property);
  const previous = context.state.sliceDoc(object.from + 1, from).trimEnd();
  if (!name && previous && !previous.endsWith(",")) return null;
  const existing = new Set(object.getChildren("Property").filter(child => child.from !== property?.from).map(child => readKey(context.state, child)));
  const prefix = context.state.sliceDoc(from, context.pos).replace(/^"|"$/g, "").toLowerCase();
  const options = Object.entries(schema.properties ?? {}).filter(([key]) => !existing.has(key) && key.toLowerCase().startsWith(prefix))
    .map(([key, value]) => propertyCompletion(key, path, value, hasOwnColon(context.state, property)));
  return { from, to, options, filter: false };
}
function valueResult(context: CompletionContext, property: Node, path: string[], schema: Schema): CompletionResult | null {
  const key = readKey(context.state, property);
  const field = schema.properties?.[key];
  if (!field) return null;
  const choices = [...valueChoices(field), ...bindingChoices(field)];
  if (!choices.length) return null;
  const colon = property.getChild(":")!;
  const value = colon.nextSibling;
  const from = value && value.from <= context.pos ? value.from : context.pos;
  const to = value && value.to >= context.pos ? value.to : context.pos;
  const meta = fieldInfo([...path, key].join("."), field);
  const prefix = context.state.sliceDoc(from, context.pos);
  const options = choices.filter(choice => context.explicit || JSON.stringify(choice).startsWith(prefix));
  return { from, to, filter: false, options: options.map(choice => ({ label: JSON.stringify(choice), type: "enum", ...meta, info: undefined })) };
}
export function completeDesignJSON(context: CompletionContext): CompletionResult | null {
  const object = objectAt(context.state, context.pos);
  if (!object) return null;
  const path = nodePath(context.state, object);
  const schema = schemaForNode(context.state, object);
  if (object.name === "Array") return arrayResult(context, object, path);
  if (!schema?.properties) return null;
  const property = object.getChildren("Property").find(child => child.from <= context.pos && child.to >= context.pos);
  const colon = property?.getChild(":");
  if (property && colon && context.pos > colon.from) return valueResult(context, property, path, schema);
  return propertyResult(context, object, path, schema, property);
}

/** Brief help follows the caret even for free-text or numeric fields without choices. */
export function designHelpAt(state: EditorState): string {
  let node: Node | null = syntaxTree(state).resolveInner(state.selection.main.head, -1);
  while (node && node.name !== "Property") node = node.parent;
  if (!node?.parent) return "Type a setting or value to see suggestions. Ctrl+Space opens all available choices.";
  const path = [...nodePath(state, node.parent), readKey(state, node)].join(".");
  const field = fields.get(path);
  if (field) return `${path} — ${field.description} ${field.values}`;
  const schema = schemaForNode(state, node.parent)?.properties?.[readKey(state, node)];
  return schema ? fieldInfo(path, schema).info : "Only supported design settings are suggested.";
}

function bindingChoices(schema: Schema): unknown[] {
  const binding = schema.anyOf?.find(option => option.properties?.bind)?.properties?.bind;
  return binding ? valueChoices(binding).map(bind => ({ bind })) : [];
}
function arrayResult(context: CompletionContext, array: Node, path: string[]): CompletionResult | null {
  if (path.join(".") !== "homepage.sections") return null;
  const before = context.state.sliceDoc(array.from + 1, context.pos).trimEnd();
  if (before && !before.endsWith(",")) return null;
  const used = array.getChildren("Object").map(node => {
    try { return JSON.parse(context.state.sliceDoc(node.from, node.to)).component; } catch { return null; }
  });
  return { from: context.pos, options: componentExamples.filter(example => !used.includes(example.component)).map(example => ({
    label: example.component, type: "type", description: example.component === "hero" ? "Welcome section with content bindings." : "Display published stories in this position.",
    apply: JSON.stringify(example, null, 2) + (context.state.sliceDoc(context.pos).trimStart().startsWith("{") ? "," : ""),
  })) };
}
