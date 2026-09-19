/**
 * Build the publishable artifacts into `dist/`.
 *
 * OpenCode provides `@opencode/plugin`, `@opentui/*` and `solid-js` at runtime,
 * and it loads `.tsx` sources by transpiling them — which fails for
 * npm-installed plugins because the Solid JSX runtime cannot be resolved from
 * the plugin cache. Prebuilding with `babel-preset-solid` (the same approach as
 * other published OpenCode TUI plugins) avoids that.
 */

import babel from "@babel/core";
import typescriptPreset from "@babel/preset-typescript";
import solidPreset from "babel-preset-solid";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

/** Give emitted relative imports an explicit `.js` extension. */
function withJsExtensions(code) {
  return code.replace(
    /(from\s+["'])(\.\.?\/[^"']+?)(["'])/g,
    (match, prefix, specifier, suffix) =>
      /\.(?:js|mjs|cjs|json)$/.test(specifier) ? match : `${prefix}${specifier}.js${suffix}`,
  );
}

async function build(source, presets) {
  const sourcePath = path.join(rootDir, source);
  const code = await fs.readFile(sourcePath, "utf8");
  const result = await babel.transformAsync(code, {
    filename: sourcePath,
    configFile: false,
    babelrc: false,
    presets,
  });
  if (!result?.code) throw new Error(`Babel produced no output for ${source}`);
  const outPath = path.join(distDir, source.replace(/\.tsx?$/, ".js"));
  await fs.writeFile(outPath, `${withJsExtensions(result.code)}\n`);
  return path.relative(rootDir, outPath);
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

const written = [
  await build("index.ts", [[typescriptPreset]]),
  await build("usage.ts", [[typescriptPreset]]),
  await build("tui.tsx", [
    [solidPreset, { moduleName: "@opentui/solid", generate: "universal" }],
    [typescriptPreset],
  ]),
];

console.log(`built ${written.join(", ")}`);
