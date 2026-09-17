import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

// Every source below is untested and every test file imports an unrelated
// module, which is the worst case for import detection: no scan can stop
// early, so checking each source against the full text of every test file
// costs sources * tests in scanned bytes. The sizes model a badly covered
// repository (6500 sources, 600 tests of ~30 KB), and the per-call timeout
// fails the tool long before that quadratic scan could finish.
const SOURCE_FILES = 6500;
const TEST_FILES = 600;
const TEST_FILE_LINES = 900;
const CALL_TIMEOUT_MS = 9000;

function buildWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-intel-scale-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "tests"));

  for (let i = 0; i < SOURCE_FILES; i++) {
    fs.writeFileSync(
      path.join(root, "src", `widget${i}.ts`),
      [
        `export function widget${i}Calc(a: number, b: number): number {`,
        `  if (a <= 0) return b * 2;`,
        `  return a + b + ${i};`,
        `}`,
        "",
        `export const widget${i}Label = (input: string): string => {`,
        `  return input.trim().toLowerCase();`,
        `};`,
        "",
      ].join("\n"),
    );
  }

  // The tests import gadget modules, never the widget sources, so every
  // widget stays untested and exercises the full detection pass.
  for (let i = 0; i < TEST_FILES; i++) {
    const lines = [
      `import { describe, it, expect } from "vitest";`,
      `import { gadget${i} } from "../src/gadgets/gadget${i}.js";`,
      `import { gadgetHelper${i} } from "../src/helpers/gadgetHelper${i}";`,
      "",
      `describe("gadget${i}", () => {`,
    ];
    while (lines.length < TEST_FILE_LINES) {
      const k = lines.length;
      lines.push(
        `  it("handles case ${k} for gadget${i}", () => {`,
        `    const value = gadget${i}(${k});`,
        `    expect(value).toBeGreaterThan(0);`,
        `    expect(typeof value).toBe("number");`,
        `    const label = \`gadget-${i}-case-${k}\`;`,
        `    if (value % 2 === 0) {`,
        `      expect(label).toContain("case");`,
        `    }`,
        `  });`,
        "",
      );
    }
    lines.push("});", "");
    fs.writeFileSync(path.join(root, "tests", `gadget${i}.test.ts`), lines.join("\n"));
  }

  return root;
}

test(
  "import detection reads the test files once instead of once per source file",
  { timeout: 12000 },
  async () => {
    const root = buildWorkspace();
    const client = new Client({ name: "find-untested-functions-scale-test", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: root,
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const result = await client.callTool(
        {
          name: "find_untested_functions",
          arguments: { source_dir: path.join(root, "src"), test_dir: path.join(root, "tests") },
        },
        undefined,
        { timeout: CALL_TIMEOUT_MS },
      );
      assert.ok(!result.isError, JSON.stringify(result.content).slice(0, 200));
      const text = result.content.find((item) => item.type === "text");
      assert.match(
        text.text,
        new RegExp(`Found ${SOURCE_FILES} source file\\(s\\) with no test coverage`),
      );
    } finally {
      await client.close().catch(() => undefined);
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
