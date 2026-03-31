import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = scriptDir;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function extensionFor(filePath) {
  return path.extname(filePath).toLowerCase();
}

function isTextAsset(filePath) {
  return TEXT_EXTENSIONS.has(extensionFor(filePath));
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[extensionFor(filePath)] || "application/octet-stream";
}

function cacheControlFor(key) {
  return key === "index.html" || key.endsWith(".html")
    ? "no-cache"
    : "public, max-age=31536000, immutable";
}

function derivedFrontendNames() {
  const backendName = path.basename(backendDir);
  const trimmedUnderscore = backendName.endsWith("_backend")
    ? backendName.slice(0, -"_backend".length)
    : backendName;
  const trimmedDash = trimmedUnderscore.endsWith("-backend")
    ? trimmedUnderscore.slice(0, -"-backend".length)
    : trimmedUnderscore;

  if (!trimmedDash || trimmedDash === backendName) {
    return [];
  }

  return [
    trimmedDash,
    `${trimmedDash}_front`,
    `${trimmedDash}_frontend`,
    `${trimmedDash}-front`,
    `${trimmedDash}-frontend`,
  ];
}

function resolveFrontendDir() {
  const parentDir = path.resolve(backendDir, "..");
  const explicit = process.env.FRONTEND_DIR;
  const candidates = [];

  if (explicit) {
    candidates.push(explicit);
  }

  for (const name of derivedFrontendNames()) {
    candidates.push(path.join(parentDir, name));
  }
  candidates.push(path.join(parentDir, "front"));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "pubspec.yaml"))) {
      return candidate;
    }
  }

  const siblingDirs = fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parentDir, entry.name));

  for (const candidate of siblingDirs) {
    if (candidate !== backendDir && fs.existsSync(path.join(candidate, "pubspec.yaml"))) {
      return candidate;
    }
  }

  fail("Unable to locate Flutter frontend directory. Set FRONTEND_DIR first.");
}

function walkFiles(rootDir) {
  const results = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      results.push(absolutePath);
    }
  }

  return results;
}

function buildAssetRecord(filePath, buildDir) {
  const relativeKey = path.relative(buildDir, filePath).split(path.sep).join("/");
  const fileBuffer = fs.readFileSync(filePath);
  const textAsset = isTextAsset(filePath);
  const body = textAsset
    ? fileBuffer.toString("utf8")
    : fileBuffer.toString("base64");

  return {
    key: relativeKey,
    value: JSON.stringify({
      body,
      cacheControl: cacheControlFor(relativeKey),
      contentType: contentTypeFor(filePath),
      encoding: textAsset ? "utf8" : "base64",
    }),
  };
}

function main() {
  const frontendDir = resolveFrontendDir();
  const buildDir = path.join(frontendDir, "build", "web");
  const outputPath = path.join(backendDir, "assets.json");

  if (!fs.existsSync(buildDir)) {
    fail(`Flutter web build output not found: ${buildDir}`);
  }

  const files = walkFiles(buildDir).sort();
  if (files.length === 0) {
    fail(`Flutter web build output is empty: ${buildDir}`);
  }

  const payload = files.map((filePath) => buildAssetRecord(filePath, buildDir));
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Generated ${payload.length} asset records from ${buildDir}`);
  console.log(`Wrote ${outputPath}`);
}

main();
