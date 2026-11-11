import parser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "release/**",
      ".data/**",
      "artifacts/**",
      "coverage/**",
    ],
  },
  {
    files: ["*.{ts,tsx}", "src/**/*.{ts,tsx}", "shared/**/*.{ts,tsx}", "cli/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "packaging/**/*.{ts,tsx}", "examples/**/*.{ts,tsx}"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: { complexity: ["error", { max: 10 }] },
  },
];
