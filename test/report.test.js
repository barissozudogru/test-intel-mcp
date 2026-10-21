import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("report rejects extra positional arguments", () => {
  const result = spawnSync(process.execPath, [
    "dist/report.js",
    "evidence/p-limit-7.3.1/lcov.info",
    "lcov",
    "unexpected",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Usage: test-intel-report <coverage-path> \[lcov\|istanbul\|cobertura\]/);
});
