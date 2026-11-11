import { deploymentPath } from "./shared/deployment-path";
import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";

const apiOrigin = process.env.MARGIN_DEV_API_ORIGIN || "http://127.0.0.1:3001";

export default defineConfig({
  base: (deploymentPath()) + "/",
  plugins: [reactRouter()],
  server: {
    proxy: {
      "/api": apiOrigin,
      "/manifest.webmanifest": apiOrigin,
      "/pwa": apiOrigin,
      "/favicon.ico": apiOrigin,
      "/rss.xml": apiOrigin,
      "/robots.txt": apiOrigin,
      "/sitemap.xml": apiOrigin,
    },
  },
});
