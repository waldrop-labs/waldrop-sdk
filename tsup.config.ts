import { defineConfig } from "tsup";

// Dual ESM/CJS build with .d.ts emission. Browser-and-Node compatible
// (no Node-specific imports in src/). Externalises peer deps so consumers
// pull a single copy of @mysten/sui rather than a bundled-in version.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["@mysten/sui", "@mysten/seal"],
  treeshake: true,
  minify: false,
});
