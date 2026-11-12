// Builds a static copy of DriftLine for GitHub Pages in ./_site.
// GitHub Pages serves the site under /PL_Statement_analyser/ and has no clean URLs or
// server functions, so this rewrites root-relative links to relative ones, gives
// /app and /case-study their own folders, and points /api calls at the Vercel deployment.
// The diagnostic itself runs in the browser, so it works fully from this copy.
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const API = process.env.DRIFTLINE_API || "https://driftline-amber.vercel.app";
const OUT = "_site";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
cpSync("assets", join(OUT, "assets"), { recursive: true });

// prefix = path from the file's folder back to the site root
function rewrite(text, prefix) {
  return text
    .replace(/(["'`(])\/api\//g, `$1${API}/api/`)
    .replace(/(["'`(])\/assets\//g, `$1${prefix}assets/`)
    .replace(/(href=")\/app(["#?])/g, `$1${prefix}app/$2`)
    .replace(/(href=")\/case-study(["#?])/g, `$1${prefix}case-study/$2`)
    .replace(/(href=")\/#/g, `$1${prefix || "./"}#`)
    .replace(/(href=")\/"/g, `$1${prefix || "./"}"`);
}

const pages = [["index.html", "index.html", ""], ["app.html", "app/index.html", "../"], ["case-study.html", "case-study/index.html", "../"]];
for (const [src, dest, prefix] of pages) {
  const out = join(OUT, dest);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rewrite(readFileSync(src, "utf8"), prefix));
}

// CSS and JS inside assets/ reference /assets/... ; from there that is the same folder.
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "vendor") walk(p); continue; }
    if (/\.(css|js)$/.test(name)) {
      const depth = p.split("/").length - 3; // _site/assets/x = 0 extra levels
      writeFileSync(p, rewrite(readFileSync(p, "utf8"), "../".repeat(depth + 1)));
    }
  }
})(join(OUT, "assets"));

writeFileSync(join(OUT, ".nojekyll"), "");
writeFileSync(join(OUT, "404.html"), readFileSync(join(OUT, "index.html")));
console.log("Built", OUT);
