export const codeLanguages = [
  ["text", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["java", "Java"],
  ["csharp", "C#"],
  ["c", "C"],
  ["cpp", "C++"],
  ["json", "JSON"],
  ["ipynb", "Jupyter notebook"],
  ["bash", "Shell / Bash"],
  ["sql", "SQL"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["yaml", "YAML"],
  ["markdown", "Markdown"],
  ["diff", "Diff"],
] as const;
const aliases: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  golang: "go",
  rs: "rust",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  html: "xml",
  yml: "yaml",
  md: "markdown",
  plaintext: "text",
  txt: "text",
  none: "text",
};
export function codeLanguage(value: string): string {
  const key = value.trim().toLowerCase();
  return Object.hasOwn(aliases, key) ? aliases[key] : key;
}
export function codeLanguageLabel(value: string): string {
  const canonical = codeLanguage(value);
  return (
    codeLanguages.find(([id]) => id === canonical)?.[1] || value || "Plain text"
  );
}
