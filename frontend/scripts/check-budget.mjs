import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = "dist";
const manifestPath = join(dist, ".vite/manifest.json");
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`FAIL missing ${manifestPath}; run npm run build first`);
  process.exit(1);
}

const take = (key) => {
  const record = manifest[key];
  if (!record) throw new Error(`manifest entry missing: ${key}`);
  return record;
};

function withImports(key, seen = new Set()) {
  if (seen.has(key)) return [];
  seen.add(key);
  const record = take(key);
  const files = record.file ? [record.file] : [];
  for (const imported of record.imports ?? []) {
    files.push(...withImports(imported, seen));
  }
  return files;
}

const gzipKb = (relative) => gzipSync(readFileSync(join(dist, relative))).byteLength / 1024;

const entry = take("index.html");
const entryFiles = withImports("index.html");
const entrySize = entryFiles.reduce((total, file) => total + gzipKb(file), 0);
const workspace = take("src/components/Workspace.tsx");
const workspaceSize = gzipKb(workspace.file);
const cssFiles = new Set();
for (const key of ["index.html", ...(entry.imports ?? [])]) {
  const record = manifest[key];
  for (const css of record?.css ?? []) cssFiles.add(css);
}
const cssSize = [...cssFiles].reduce((total, file) => total + gzipKb(file), 0);

const checks = [
  ["entry", entrySize, 120, `${entryFiles.length} chunks`],
  ["workspace", workspaceSize, 175, workspace.file],
  ["css", cssSize, 40, [...cssFiles].join(", ")],
];

let failed = false;
for (const [label, size, budget, detail] of checks) {
  const ok = size <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"} ${label.padEnd(9)} ${size.toFixed(1).padStart(7)} kB gzip / ${budget} kB  ${detail}`);
}
if (failed) process.exit(1);
