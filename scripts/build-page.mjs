import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

const at = (path) => new URL(`../${path}`, import.meta.url).pathname;
mkdirSync(at("public"), { recursive: true });

await build({
  entryPoints: [at("page/main.tsx")],
  outdir: at("public"),
  entryNames: "app",
  assetNames: "[name]",
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  loader: { ".woff2": "file", ".woff": "file" },
  define: { "import.meta.env": '{"SSR":false,"MODE":"production","DEV":false}' },
  logLevel: "warning",
});
execFileSync(
  at("node_modules/.bin/tailwindcss"),
  ["-i", at("page/app.css"), "-o", at("public/page.css"), "--minify"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
copyFileSync(at("page/index.html"), at("public/index.html"));
console.log("built public/");
