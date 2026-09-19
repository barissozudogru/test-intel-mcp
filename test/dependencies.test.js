import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("lockfile resolves patched versions for hono and qs", () => {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const honoVersion = lock.packages["node_modules/hono"]?.version;
  const qsVersion = lock.packages["node_modules/qs"]?.version;

  assert.ok(honoVersion && honoVersion !== "4.13.4", `hono is pinned to ${honoVersion}`);
  assert.ok(qsVersion && qsVersion !== "6.15.3", `qs is pinned to ${qsVersion}`);
});

test("@types/node targets Node 22 to match the supported runtime", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const nodeTypes = pkg.devDependencies["@types/node"];

  assert.match(nodeTypes, /^\^22(\.|$)/, `@types/node should target ^22, got ${nodeTypes}`);
});
