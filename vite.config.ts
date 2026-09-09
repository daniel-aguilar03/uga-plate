import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Extra files copied from public/ that are worth having offline. */
const STATIC_PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-512.png",
];

/**
 * Stamps the built asset list into public/sw.js. Without this the service
 * worker has nothing to fall back on the first time the phone goes offline,
 * because the initial page load happens before the worker is controlling it.
 */
function swPrecache(): Plugin {
  let outDir = "dist";
  return {
    name: "sw-precache",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async writeBundle(_options, bundle) {
      const swPath = path.join(outDir, "sw.js");
      const assets = Object.keys(bundle).map((file) => `./${file}`);
      const precache = [...new Set([...STATIC_PRECACHE, ...assets])];
      const version = createHash("sha256")
        .update(precache.join("|"))
        .digest("hex")
        .slice(0, 12);

      const source = await readFile(swPath, "utf8");
      await writeFile(
        swPath,
        source
          .replace("__SW_PRECACHE__", JSON.stringify(precache))
          .replace("__SW_VERSION__", version),
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), swPrecache()],
  // The catalog is a large JSON blob; emitting it as JSON.parse of a string
  // parses far faster on a phone than an inline object literal.
  json: { stringify: true },
  server: {
    host: true,
  },
});
