import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const reportCli = fileURLToPath(new URL("../dist/report.js", import.meta.url));

function reportOn(lcovLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-lcov-"));
  fs.writeFileSync(path.join(root, "dup.info"), lcovLines.join("\n"));

  try {
    return spawnSync(process.execPath, [reportCli, "dup.info"], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const shard = (branchTaken) => [
  "TN:",
  "SF:src/a.ts",
  "FN:1,(anonymous_0)",
  "FNDA:1,(anonymous_0)",
  "DA:1,1",
  `BRDA:1,0,0,${branchTaken}`,
  "end_of_record",
];

test("a branch hit in one shard covers the same branch missed in another", () => {
  // Concatenated shards repeat SF:src/a.ts. Branch 1:0:0 was taken by the
  // second run, so the merged truth is 1/1 branches covered.
  const result = reportOn([...shard(0), ...shard(1)]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All files have full coverage\. No gaps found\./);
});

test("a branch missed by every shard is still reported uncovered", () => {
  const result = reportOn([...shard(0), ...shard(0)]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Branch coverage:\s+0%/);
  assert.match(result.stdout, /Uncovered branches: line 1 block 0 branch 0/);
});
