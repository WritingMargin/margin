import { readFile, readdir } from "node:fs/promises";
import { deploymentPath } from "./shared/deployment-path";
import { defineConfig } from "vite";

export default defineConfig({
  base: deploymentPath() + "/",
  plugins: [
    {
      name: "margin-pdf-resources",
      async generateBundle() {
        const { version } = JSON.parse(
          await readFile("node_modules/pdfjs-dist/package.json", "utf8"),
        );
        for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
          for (const name of await readdir(
            `node_modules/pdfjs-dist/${directory}`,
          )) {
            this.emitFile({
              type: "asset",
              fileName: `pdfjs/${version}/${directory}/${name}`,
              source: await readFile(
                `node_modules/pdfjs-dist/${directory}/${name}`,
              ),
            });
          }
        }
      },
    },
    {
      name: "margin-deployment-path",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "margin-base-path.txt",
          source: deploymentPath(),
        });
      },
    },
  ],
  build: {
    outDir: `${process.env.MARGIN_WEB_BUILD_DIR || "dist"}/client`,
    emptyOutDir: false,
    assetsDir: "public-assets",
    manifest: "public-manifest.json",
    rollupOptions: {
      input: ["src/public-entry.tsx", "src/citations/pdf-entry.tsx"],
    },
  },
});
