import { deploymentPath } from "./shared/deployment-path";
import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  buildDirectory: process.env.MARGIN_WEB_BUILD_DIR || "dist",
  ssr: false,
  basename: deploymentPath() || "/",
} satisfies Config;
