#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const helpRequested = rawArgs.includes("--help") || rawArgs.includes("-h");
const [coveragePath, requestedFormat] = rawArgs.filter(
  (arg) => arg !== "--help" && arg !== "-h"
);
const formats = new Set(["lcov", "istanbul", "cobertura"]);

function firstText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      return item.text;
    }
  }
  return undefined;
}

function usage(exitCode: number): never {
  const output = [
    "Usage: test-intel-report <coverage-path> [lcov|istanbul|cobertura]",
    "",
    "Source and documentation:",
    "  https://github.com/barissozudogru/test-intel-mcp",
    "",
  ].join("\n");
  (exitCode === 0 ? process.stdout : process.stderr).write(output);
  process.exit(exitCode);
}

if (helpRequested) {
  usage(0);
}

if (!coveragePath || (requestedFormat && !formats.has(requestedFormat))) {
  usage(1);
}

const client = new Client({ name: "test-intel-report", version: "1.0.0" });
const serverPath = fileURLToPath(new URL("./index.js", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: process.cwd(),
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "analyze_test_coverage",
    arguments: {
      coverage_path: coveragePath,
      ...(requestedFormat ? { format: requestedFormat } : {}),
    },
  });
  const text = firstText(result.content);
  if (!text) {
    throw new Error("The coverage tool returned no text report");
  }
  if (result.isError) {
    process.stderr.write(`${text}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${text}\n`);
  }
} catch (error) {
  process.stderr.write(
    `test-intel-report failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
