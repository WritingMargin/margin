import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
// Central is a separate repository. Keep its generated bundle checked in so
// Go builds and Docker images do not require Node or the engine checkout.
const destination =
  process.argv[2] || resolve(root, "margin-central/internal/central/cloud");
await build({
  absWorkingDir: root,
  entryPoints: ["src/marketing-demo/blocks.tsx"],
  outfile: resolve(destination, "demo-blocks.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  legalComments: "eof",
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.BASE_URL": '"/"',
  },
});
console.log(`Built Margin reader demo blocks in ${destination}`);
