import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

// extractFunctions and analyzeComplexity are not exported, so they are
// exercised through the tools that render their output.
async function callTool(root, name, arguments_) {
  const client = new Client({ name: "function-analysis-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: root,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: arguments_ });
    assert.ok(!result.isError, JSON.stringify(result.content));
    return result.content.find((item) => item.type === "text").text;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function writeWorkspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-functions-"));
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), content);
  }
  return root;
}

const shapesSource = [
  "export function plain(x: number) {",
  "  return x;",
  "}",
  "",
  "export const arrow = (x: number) => {",
  "  return x * 2;",
  "};",
  "",
  "export const asyncArrow = async (x: number) => {",
  "  return x * 3;",
  "};",
  "",
  "export async function asy() {",
  "  await Promise.resolve();",
  "}",
  "",
  "export class Widget {",
  "  private reset() {}",
  '  get label() { return "w"; }',
  "  async load() {}",
  "}",
  "",
  "/*",
  "function commentedOut(x: number) {",
  "  return x;",
  "}",
  "*/",
  "",
  "// function lineCommented(x: number) { return x; }",
  "",
].join("\n");

const complexitySource = [
  "function simple(x) {",
  "  return x + 1;",
  "}",
  "",
  "function switchy(code) {",
  "  switch (code) {",
  "    case 1:",
  '      return "one";',
  "    case 2:",
  '      return "two";',
  "    default:",
  '      return "other";',
  "  }",
  "}",
  "",
  "function loopAndTry(items) {",
  "  for (const item of items) {",
  "    while (item.next) {",
  "      item = item.next;",
  "    }",
  "  }",
  "  try {",
  "    return items[0];",
  "  } catch (err) {",
  "    return null;",
  "  }",
  "}",
  "",
  "function decisionHeavy(a, b, c) {",
  "  if (a > 0 && b > 0) {",
  "    return a;",
  "  } else if (c ?? 0) {",
  "    return b;",
  "  }",
  "  return a > b ? a : b;",
  "}",
  "",
  "function risky(steps) {",
  '  if (steps === 0) return "zero";',
  '  if (steps === 1) return "one";',
  '  if (steps === 2) return "two";',
  '  if (steps === 3) return "three";',
  '  if (steps === 4) return "four";',
  '  if (steps > 4 && steps < 8) return "some";',
  '  if (steps > 8 || steps < 0) return "none";',
  '  return "rest";',
  "}",
  "",
  "function tangled(value, flag, mode) {",
  "  if (flag && value > 0) {",
  "    return value ?? 1;",
  "  }",
  "  if (!flag || value < 0) {",
  "    return 0;",
  "  }",
  "  for (let i = 0; i < value; i++) {",
  "    if (i % 2 === 0) continue;",
  "  }",
  "  while (mode > 0) {",
  "    mode = mode - 1;",
  "  }",
  "  try {",
  "    switch (mode) {",
  "      case 0:",
  "        return 1;",
  "      case 1:",
  "        return 2;",
  "      case 2:",
  "        return 4;",
  "      case 3:",
  "        return 5;",
  "      default:",
  "        return 3;",
  "    }",
  "  } catch (err) {",
  "    return -1;",
  "  }",
  "  return value ? 1 : 2;",
  "}",
  "",
  "async function patient(work) {",
  "  await work();",
  "  return Promise.all([1]);",
  "}",
  "",
].join("\n");

test("find_untested_functions lists every declared function kind at its line", async () => {
  // No test file exists for shapes.ts, so every extracted function is
  // listed with the kind extractFunctions classified it as.
  const root = writeWorkspace({ "src/shapes.ts": shapesSource });

  try {
    const report = await callTool(root, "find_untested_functions", {
      source_dir: path.join(root, "src"),
    });

    assert.match(report, /Found 1 source file\(s\) with no test coverage/);
    assert.match(report, /Functions without tests \(7\)/);
    assert.match(report, /- plain \(line 1, function\)/);
    assert.match(report, /- arrow \(line 5, arrow\)/);
    assert.match(report, /- asyncArrow \(line 9, async-arrow\)/);
    assert.match(report, /- asy \(line 13, async-function\)/);
    assert.match(report, /- reset \(line 18, method\)/);
    assert.match(report, /- label \(line 19, method\)/);
    assert.match(report, /- load \(line 20, async-method\)/);
    // Declarations inside block and line comments are not real functions.
    assert.doesNotMatch(report, /commentedOut/);
    assert.doesNotMatch(report, /lineCommented/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("get_function_complexity counts decision points and bands them by priority", async () => {
  const root = writeWorkspace({ "complexity.ts": complexitySource });

  try {
    const report = await callTool(root, "get_function_complexity", {
      file_path: path.join(root, "complexity.ts"),
    });

    const rows = report
      .split("\n")
      .filter((line) => /^(critical|high|medium|low)\s+\|/.test(line))
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .map((cells) => ({
        priority: cells[0],
        name: cells[1],
        line: Number(cells[2]),
        cyclomatic: Number(cells[3]),
        branches: Number(cells[4]),
        loops: Number(cells[5]),
        tryCatch: Number(cells[6]),
        returns: Number(cells[7]),
        asyncPatterns: Number(cells[8]),
      }));

    // Rows come out sorted by descending cyclomatic complexity.
    // tangled: 1 + 7 branches (3 if, &&, ??, ||, ternary) + 2 loops
    // + 1 try + 4 case labels = 15, exactly the critical threshold.
    // risky: 1 + 7 if + && + || = 10. decisionHeavy: 1 + 2 if + && + ??
    // + ternary = 6. loopAndTry: 1 + 2 loops + 1 try = 4, and the catch
    // is not counted separately. switchy: case labels count, the switch
    // keyword does not, so 1 + 2 = 3 and it stays low priority.
    assert.deepEqual(rows, [
      { priority: "critical", name: "tangled", line: 49, cyclomatic: 15, branches: 7, loops: 2, tryCatch: 1, returns: 9, asyncPatterns: 1 },
      { priority: "high", name: "risky", line: 38, cyclomatic: 10, branches: 9, loops: 0, tryCatch: 0, returns: 8, asyncPatterns: 0 },
      { priority: "medium", name: "decisionHeavy", line: 29, cyclomatic: 6, branches: 5, loops: 0, tryCatch: 0, returns: 3, asyncPatterns: 0 },
      { priority: "medium", name: "loopAndTry", line: 16, cyclomatic: 4, branches: 0, loops: 2, tryCatch: 1, returns: 2, asyncPatterns: 1 },
      { priority: "low", name: "switchy", line: 5, cyclomatic: 3, branches: 0, loops: 0, tryCatch: 0, returns: 3, asyncPatterns: 0 },
      { priority: "low", name: "simple", line: 1, cyclomatic: 1, branches: 0, loops: 0, tryCatch: 0, returns: 1, asyncPatterns: 0 },
      { priority: "low", name: "patient", line: 81, cyclomatic: 1, branches: 0, loops: 0, tryCatch: 0, returns: 1, asyncPatterns: 2 },
    ]);
    assert.match(report, /Summary: 1 critical, 1 high, 2 medium, 3 low priority/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
