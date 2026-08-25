import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSafePath } from "../dist/safe-path.js";

test("safe paths stay inside the canonical project root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-root-"));
  const file = path.join(root, "coverage.info");
  fs.writeFileSync(file, "TN:\n");

  try {
    const safePath = createSafePath(root);
    assert.equal(safePath(file), fs.realpathSync(file));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("safe paths reject a symlink that escapes the project root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-outside-"));
  const outsideFile = path.join(outside, "coverage.info");
  const link = path.join(root, "linked-coverage.info");
  fs.writeFileSync(outsideFile, "TN:\n");
  fs.symlinkSync(outsideFile, link);

  try {
    const safePath = createSafePath(root);
    assert.throws(() => safePath(link), /Access denied/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
