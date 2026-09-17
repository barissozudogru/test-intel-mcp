import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function writeWorkspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-gap-"));
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), content);
  }
  return root;
}

async function findUntested(root, arguments_) {
  const client = new Client({ name: "find-untested-functions-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: root,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "find_untested_functions", arguments: arguments_ });
    assert.ok(!result.isError, JSON.stringify(result.content));
    const text = result.content.find((item) => item.type === "text");
    return text.text;
  } finally {
    await client.close().catch(() => undefined);
  }
}

const thingSource = [
  "export function computeA(x: number): number {",
  "  return x + 1;",
  "}",
  "",
].join("\n");

test("a helper import in an explicit test_dir does not count as a test", async () => {
  // tests/helper.ts is not a test file, so its import of thing.ts must not
  // mark thing.ts as tested even when test_dir is supplied.
  const root = writeWorkspace({
    "src/thing.ts": thingSource,
    "tests/helper.ts": 'import { computeA } from "../src/thing.js";\n\nexport function makeInput() {\n  return computeA(1);\n}\n',
  });

  try {
    const report = await findUntested(root, {
      source_dir: path.join(root, "src"),
      test_dir: path.join(root, "tests"),
    });

    assert.match(report, /Found 1 source file\(s\) with no test coverage/);
    assert.match(report, /computeA \(line 1, function\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a helper import next to the source does not count as a test", async () => {
  const root = writeWorkspace({
    "src/thing.ts": thingSource,
    "src/helper.ts": 'import { computeA } from "./thing.js";\n\nexport function makeInput() {\n  return computeA(1);\n}\n',
  });

  try {
    const report = await findUntested(root, { source_dir: path.join(root, "src") });

    // helper.ts is a source file in its own right here, so it can appear as a
    // gap too. The point under test is that thing.ts is not hidden by it.
    assert.match(report, /Source: .*src\/thing\.ts/);
    assert.match(report, /computeA \(line 1, function\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a .test. file in an explicit test_dir still counts as a test", async () => {
  const root = writeWorkspace({
    "src/thing.ts": thingSource,
    "tests/thing.test.ts": 'import { computeA } from "../src/thing.js";\n\ncomputeA(1);\n',
  });

  try {
    const report = await findUntested(root, {
      source_dir: path.join(root, "src"),
      test_dir: path.join(root, "tests"),
    });

    assert.match(report, /All 1 source file\(s\) have corresponding tests\. No gaps found\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a bare-named file under __tests__ in an explicit test_dir still counts as a test", async () => {
  const root = writeWorkspace({
    "src/thing.ts": thingSource,
    "tests/__tests__/thing.ts": 'import { computeA } from "../../src/thing.js";\n\ncomputeA(2);\n',
  });

  try {
    const report = await findUntested(root, {
      source_dir: path.join(root, "src"),
      test_dir: path.join(root, "tests"),
    });

    assert.match(report, /All 1 source file\(s\) have corresponding tests\. No gaps found\./);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
