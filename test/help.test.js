import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryUrl = "https://github.com/barissozudogru/test-intel-mcp";

for (const binary of ["dist/index.js", "dist/report.js"]) {
  test(`${binary} help links to the source repository`, () => {
    const result = spawnSync(process.execPath, [binary, "--help"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(repositoryUrl.replaceAll("/", "\\/")));
  });
}
