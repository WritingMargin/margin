import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import csharp from "highlight.js/lib/languages/csharp";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import { codeLanguage } from "../../shared/code-languages";

const grammars = {
  javascript,
  typescript,
  python,
  go,
  rust,
  java,
  csharp,
  cpp,
  c,
  json,
  bash,
  sql,
  xml,
  css,
  yaml,
  markdown,
  diff,
};
for (const [name, grammar] of Object.entries(grammars))
  hljs.registerLanguage(name, grammar);
const detectLanguages = Object.keys(grammars).filter(
  (name) => name !== "markdown",
);
function escaped(source: string): string {
  return source
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}
export function highlightCode(source: string, requested = "auto") {
  const language = codeLanguage(requested);
  const plain = {
    html: escaped(source),
    language: language === "auto" ? "text" : language,
  };
  // Keep large pasted files editable without blocking on automatic detection.
  if (source.length > 50000 || language === "text") return plain;
  if (language !== "auto" && language !== "") {
    if (!hljs.getLanguage(language)) return plain;
    return {
      html: hljs.highlight(source, { language, ignoreIllegals: true }).value,
      language,
    };
  }
  const result = hljs.highlightAuto(source, detectLanguages);
  if (!result.language || result.relevance < 3)
    return { ...plain, language: "text" };
  return { html: result.value, language: codeLanguage(result.language) };
}
