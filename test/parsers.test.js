import assert from "node:assert/strict";
import test from "node:test";
import { parseLcov, parseIstanbul, parseCobertura } from "../dist/parsers.js";

test("parseLcov parses functions, lines, and branches directly", () => {
  const lcov = [
    "TN:",
    "SF:src/calc.ts",
    "FN:1,add",
    "FN:5,subtract",
    "FNDA:3,add",
    "FNDA:0,subtract",
    "DA:1,3",
    "DA:2,3",
    "DA:5,0",
    "DA:6,0",
    "BRDA:2,0,0,1",
    "BRDA:2,0,1,-",
    "end_of_record",
  ].join("\n");

  const items = parseLcov(lcov);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.file, "src/calc.ts");
  assert.deepEqual(items[0]?.uncoveredFunctions, ["subtract"]);
  assert.deepEqual(items[0]?.uncoveredLines, [5, 6]);
  assert.equal(items[0]?.uncoveredBranches.length, 1);
  assert.equal(items[0]?.lineCoverage, 50);
  assert.equal(items[0]?.functionCoverage, 50);
  assert.equal(items[0]?.branchCoverage, 50);
});

test("parseLcov merges duplicate file records without double counting functions", () => {
  const shard1 = [
    "SF:src/service.ts",
    "FN:10,start",
    "FN:20,stop",
    "FNDA:1,start",
    "FNDA:0,stop",
    "DA:10,1",
    "DA:20,0",
    "end_of_record",
  ].join("\n");

  const shard2 = [
    "SF:src/service.ts",
    "FN:10,start",
    "FN:20,stop",
    "FNDA:0,start",
    "FNDA:1,stop",
    "DA:10,0",
    "DA:20,1",
    "end_of_record",
  ].join("\n");

  const items = parseLcov(`${shard1}\n${shard2}`);
  assert.equal(items.length, 0);
});

test("parseIstanbul maps statements, functions, and branches to uncovered items directly", () => {
  const payload = {
    "src/math.ts": {
      s: { "1": 1, "2": 0 },
      f: { "1": 1, "2": 0 },
      b: { "1": [1, 0] },
      fnMap: {
        "1": { name: "add", loc: { start: { line: 1 } } },
        "2": { name: "multiply", loc: { start: { line: 7 } } },
      },
      statementMap: {
        "1": { start: { line: 2 } },
        "2": { start: { line: 8 } },
      },
      branchMap: {
        "1": { loc: { start: { line: 3 } } },
      },
    },
  };

  const items = parseIstanbul(JSON.stringify(payload));
  assert.equal(items.length, 1);
  assert.equal(items[0]?.file, "src/math.ts");
  assert.deepEqual(items[0]?.uncoveredFunctions, ["multiply"]);
  assert.deepEqual(items[0]?.uncoveredLines, [8]);
  assert.equal(items[0]?.uncoveredBranches.length, 1);
});

test("parseCobertura computes line and method coverage directly", () => {
  const xml = [
    '<coverage>',
    '  <packages>',
    '    <package name="main">',
    '      <classes>',
    '        <class name="Widget" filename="src/widget.ts">',
    '          <methods>',
    '            <method name="render">',
    '              <lines><line number="5" hits="2"/></lines>',
    '            </method>',
    '            <method name="destroy">',
    '              <lines><line number="10" hits="0"/></lines>',
    '            </method>',
    '          </methods>',
    '          <lines>',
    '            <line number="5" hits="2"/>',
    '            <line number="10" hits="0"/>',
    '          </lines>',
    '        </class>',
    '      </classes>',
    '    </package>',
    '  </packages>',
    '</coverage>',
  ].join('\n');

  const items = parseCobertura(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.file, "src/widget.ts");
  assert.deepEqual(items[0]?.uncoveredFunctions, ["destroy"]);
  assert.deepEqual(items[0]?.uncoveredLines, [10]);
  assert.equal(items[0]?.functionCoverage, 50);
  assert.equal(items[0]?.lineCoverage, 50);
});
