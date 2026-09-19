import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  isTestFile,
  collectImportedBasenames,
  walkDir,
} from "../dist/fs.js";

test("isTestFile identifies test files by suffix and folder directly", () => {
  assert.equal(isTestFile("src/service.test.ts"), true);
  assert.equal(isTestFile("src/service.spec.ts"), true);
  assert.equal(isTestFile("test/__tests__/helper.ts"), true);
  assert.equal(isTestFile("src/helper.ts"), false);
  assert.equal(isTestFile("test/fixture.ts"), false);
});

test("collectImportedBasenames extracts imported segments directly", () => {
  const content = [
    "import { something } from './utils.js';",
    "import defaultExport from '../components/Button';",
    "const math = require('./math');",
  ].join("\n");

  const imported = new Set();
  collectImportedBasenames(content, imported);

  assert.ok(imported.has("utils.js"));
  assert.ok(imported.has("utils"));
  assert.ok(imported.has("Button"));
  assert.ok(imported.has("math"));
});

test("walkDir finds files with matching extensions while skipping ignored directories", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), "test-walk-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "index.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(root, "src", "style.css"), "body {}");
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.ts"), "export const b = 2;");

    const found = walkDir(root, [".ts"]);
    assert.equal(found.length, 1);
    assert.ok(found[0]?.endsWith("src/index.ts"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
