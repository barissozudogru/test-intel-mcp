import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

// The parsers behind analyze_test_coverage are not exported, so they are
// exercised through the tool itself, the same way find-untested-functions
// tests drive their code paths.
async function analyzeCoverage(root, fileName, format) {
  const client = new Client({ name: "coverage-parsers-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: root,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "analyze_test_coverage",
      arguments: { coverage_path: path.join(root, fileName), format },
    });
    assert.ok(!result.isError, JSON.stringify(result.content));
    return result.content.find((item) => item.type === "text").text;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function writeWorkspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-coverage-"));
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), content);
  }
  return root;
}

test("lcov reports uncovered functions, lines, and branches", async () => {
  const lcov = [
    "TN:",
    "SF:src/calc.ts",
    "FN:1,add",
    "FN:5,subtract",
    "FNDA:3,add",
    "FNDA:0,subtract",
    "DA:1,3",
    "DA:2,3",
    "DA:6,0",
    "DA:5,0",
    "BRDA:2,0,0,1",
    "BRDA:2,0,1,-",
    "end_of_record",
  ].join("\n");
  const root = writeWorkspace({ "coverage.info": lcov });

  try {
    const report = await analyzeCoverage(root, "coverage.info", "lcov");

    assert.match(report, /Coverage gaps found in 1 file\(s\)/);
    assert.match(report, /File: src\/calc\.ts/);
    // add is hit and subtract is not, so 1 of 2 functions and 2 of 4 lines.
    assert.match(report, /Line coverage:\s+50%/);
    assert.match(report, /Function coverage:\s+50%/);
    assert.match(report, /Branch coverage:\s+50%/);
    assert.match(report, /Untested functions \(1\): subtract/);
    // Lines 6 and 5 arrive out of order but must be reported sorted.
    assert.match(report, /Uncovered lines: 5, 6\n/);
    // A taken count of '-' means the branch never executed.
    assert.match(report, /Uncovered branches: line 2 block 0 branch 1\n/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("lcov merges duplicate file records without double counting functions", async () => {
  // Two shards of the same file, as concatenation-based merging produces.
  // Each shard redeclares every FN: record; counting those again would report
  // 2 hits out of 6 functions (33%) instead of the merged truth.
  const shard = (hitInSecondOnly) => [
    "TN:",
    "SF:src/merge.ts",
    "FN:1,hitInBoth",
    "FN:2,missedInBoth",
    "FN:3,hitInSecondOnly",
    "FNDA:2,hitInBoth",
    "FNDA:0,missedInBoth",
    `FNDA:${hitInSecondOnly},hitInSecondOnly`,
    "DA:1,2",
    "DA:2,0",
    `DA:3,${hitInSecondOnly}`,
    "end_of_record",
  ];
  const lcov = [...shard(0), ...shard(7)].join("\n");
  const root = writeWorkspace({ "coverage.info": lcov });

  try {
    const report = await analyzeCoverage(root, "coverage.info", "lcov");

    assert.match(report, /File: src\/merge\.ts/);
    // 3 declared functions, 2 of them hit once the records are merged.
    assert.match(report, /Function coverage:\s+67%/);
    assert.match(report, /Line coverage:\s+67%/);
    // Missed by every shard stays uncovered; hit by any shard counts as hit.
    assert.match(report, /Untested functions \(1\): missedInBoth/);
    assert.match(report, /Uncovered lines: 2\n/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("lcov reads a final record with no end_of_record", async () => {
  // Concatenated shards are sometimes cut short; the parser must still
  // account for a trailing record.
  const lcov = [
    "TN:",
    "SF:src/trailing.ts",
    "FN:1,tail",
    "FNDA:0,tail",
    "DA:1,0",
  ].join("\n");
  const root = writeWorkspace({ "coverage.info": lcov });

  try {
    const report = await analyzeCoverage(root, "coverage.info", "lcov");

    assert.match(report, /File: src\/trailing\.ts/);
    assert.match(report, /Untested functions \(1\): tail/);
    assert.match(report, /Uncovered lines: 1\n/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("lcov reports full coverage when nothing is uncovered", async () => {
  const lcov = [
    "TN:",
    "SF:src/done.ts",
    "FN:1,only",
    "FNDA:2,only",
    "DA:1,2",
    "DA:2,2",
    "BRDA:1,0,0,2",
    "end_of_record",
  ].join("\n");
  const root = writeWorkspace({ "coverage.info": lcov });

  try {
    const report = await analyzeCoverage(root, "coverage.info", "lcov");

    assert.match(report, /All files have full coverage\. No gaps found\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("istanbul maps statement, function, and branch counts to uncovered items", async () => {
  // full.ts is entirely covered and must not appear as a gap.
  const istanbul = JSON.stringify({
    "src/istan.ts": {
      s: { 0: 1, 1: 0, 2: 0 },
      f: { 0: 2, 1: 0 },
      b: { 0: [1, 0] },
      fnMap: {
        0: { name: "kept", loc: { start: { line: 1 } } },
        1: { name: "skipped", loc: { start: { line: 5 } } },
      },
      statementMap: {
        0: { start: { line: 2 } },
        1: { start: { line: 6 } },
        2: { start: { line: 6 } },
      },
      branchMap: { 0: { loc: { start: { line: 3 } } } },
    },
    "src/full.ts": {
      s: { 0: 4 },
      f: { 0: 4 },
      b: {},
      fnMap: { 0: { name: "everything", loc: { start: { line: 1 } } } },
      statementMap: { 0: { start: { line: 2 } } },
      branchMap: {},
    },
  });
  const root = writeWorkspace({ "coverage-final.json": istanbul });

  try {
    const report = await analyzeCoverage(root, "coverage-final.json", "istanbul");

    assert.match(report, /Coverage gaps found in 1 file\(s\)/);
    assert.match(report, /File: src\/istan\.ts/);
    // 1 of 3 statements, 1 of 2 functions, 1 of 2 branch arms.
    assert.match(report, /Line coverage:\s+33%/);
    assert.match(report, /Function coverage:\s+50%/);
    assert.match(report, /Branch coverage:\s+50%/);
    assert.match(report, /Untested functions \(1\): skipped/);
    // Two uncovered statements sit on line 6 and collapse to one entry.
    assert.match(report, /Uncovered lines: 6\n/);
    assert.match(report, /Uncovered branches: branch 1 at line 3\n/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cobertura derives function coverage from method hits", async () => {
  // Method line elements only need a hits attribute; the numbered class
  // level lines are what line coverage is counted from.
  const cobertura = [
    '<?xml version="1.0"?>',
    '<coverage line-rate="0.67" branch-rate="0.5">',
    "  <packages>",
    '    <package name="main">',
    "      <classes>",
    '        <class name="Calc" filename="src/Calc.ts">',
    "          <methods>",
    '            <method name="add" signature="(II)I" line-rate="1.0">',
    '              <lines><line hits="3" branch="false"/></lines>',
    "            </method>",
    '            <method name="subtract" signature="(II)I" line-rate="0.0">',
    '              <lines><line hits="0" branch="false"/></lines>',
    "            </method>",
    "          </methods>",
    "          <lines>",
    '            <line number="1" hits="3" branch="false"/>',
    '            <line number="2" hits="3" branch="true" condition-coverage="50% (1/2)"/>',
    '            <line number="5" hits="0" branch="false"/>',
    "          </lines>",
    "        </class>",
    "      </classes>",
    "    </package>",
    "  </packages>",
    "</coverage>",
  ].join("\n");
  const root = writeWorkspace({ "coverage.xml": cobertura });

  try {
    const report = await analyzeCoverage(root, "coverage.xml", "cobertura");

    assert.match(report, /File: src\/Calc\.ts/);
    // 2 of 3 numbered lines are hit.
    assert.match(report, /Line coverage:\s+67%/);
    // add has a hit line and subtract does not, so 1 of 2 methods. A file
    // with no method data at all reports the neutral 100%.
    assert.match(report, /Function coverage:\s+50%/);
    assert.match(report, /Branch coverage:\s+50%/);
    assert.match(report, /Untested functions \(1\): subtract/);
    assert.match(report, /Uncovered lines: 5\n/);
    assert.match(report, /Uncovered branches: 1 branch\(es\) uncovered\n/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
