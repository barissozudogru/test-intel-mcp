import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFunctions,
  extractFunctionBodies,
  analyzeComplexity,
  suggestTestCases,
} from "../dist/analysis.js";

test("extractFunctions identifies declared functions and arrow functions directly", () => {
  const source = [
    "export function calculateTotal(items: number[]) {",
    "  return items.reduce((a, b) => a + b, 0);",
    "}",
    "",
    "export const formatPrice = (val: number) => {",
    "  return `$${val}`;",
    "};",
    "",
    "export async function fetchCatalog() {",
    "  return [];",
    "}",
  ].join("\n");

  const funcs = extractFunctions(source);
  assert.equal(funcs.length, 3);
  assert.equal(funcs[0]?.name, "calculateTotal");
  assert.equal(funcs[0]?.kind, "function");
  assert.equal(funcs[0]?.line, 1);

  assert.equal(funcs[1]?.name, "formatPrice");
  assert.equal(funcs[1]?.kind, "arrow");
  assert.equal(funcs[1]?.line, 5);

  assert.equal(funcs[2]?.name, "fetchCatalog");
  assert.equal(funcs[2]?.kind, "async-function");
  assert.equal(funcs[2]?.line, 9);
});

test("analyzeComplexity measures cyclomatic decision points directly", () => {
  const body = [
    "function process(val: number | null, flag: boolean) {",
    "  if (val && flag) {",
    "    return val ?? 0;",
    "  }",
    "  return 0;",
    "}",
  ].join("\n");

  const metrics = analyzeComplexity("process", 1, body);
  // Decision points: if (1), && (1), ?? (1) = 3 branches. McCabe cyclomatic = 1 + 3 = 4.
  assert.equal(metrics.cyclomaticComplexity, 4);
  assert.equal(metrics.branches, 3);
  assert.equal(metrics.priority, "medium");
});

test("suggestTestCases generates recommendations based on function signature and contents", () => {
  const body = [
    "export async function verifyUser(id: string, roles: string[]) {",
    "  if (!id) {",
    "    throw new Error('ID required');",
    "  }",
    "  return roles.includes('admin');",
    "}",
  ].join("\n");

  const suggestions = suggestTestCases(body, "verifyUser");
  assert.ok(suggestions.length >= 3);
  const categories = new Set(suggestions.map((s) => s.category));
  assert.ok(categories.has("happy-path"));
  assert.ok(categories.has("error-handling"));
  assert.ok(categories.has("async"));
});
