import { defineConfig } from "tsdown";

// Bundles the action into a single self-contained CommonJS file for the
// GitHub Actions node runtime (replaces @vercel/ncc). All dependencies are
// inlined so the published dist/ needs no node_modules.
export default defineConfig({
  entry: { index: "src/action.ts" },
  format: "cjs",
  platform: "node",
  outDir: "dist",
  noExternal: [/.*/],
  dts: false,
  clean: true,
  treeshake: true,
  outExtensions: () => ({ js: ".js" }),
});
