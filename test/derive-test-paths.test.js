import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveTestPaths } from "../dist/paths.js";

test("candidates are unique when no test_dir is given", () => {
  // Without test_dir, the target directory is the source directory, so the
  // naive candidate list contained each path twice.
  const paths = deriveTestPaths("/repo/src/cli.ts", undefined);
  assert.equal(new Set(paths).size, paths.length, `duplicates in ${JSON.stringify(paths)}`);
});

test("both .test and .spec, and both flat and __tests__, survive dedup", () => {
  const paths = deriveTestPaths("/repo/src/cli.ts", undefined);
  assert.ok(paths.some((p) => p.endsWith("/src/cli.test.ts")));
  assert.ok(paths.some((p) => p.endsWith("/src/cli.spec.ts")));
  assert.ok(paths.some((p) => p.endsWith("/src/__tests__/cli.test.ts")));
  assert.ok(paths.some((p) => p.endsWith("/src/__tests__/cli.spec.ts")));
});

test("an explicit test_dir adds locations rather than replacing them", () => {
  const paths = deriveTestPaths("/repo/src/cli.ts", "/repo/test");
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.some((p) => p.endsWith("/test/cli.test.ts")));
  assert.ok(paths.some((p) => p.endsWith("/src/cli.test.ts")));
});

test("the source extension is preserved", () => {
  assert.ok(deriveTestPaths("/repo/src/a.tsx", undefined).every((p) => p.endsWith(".tsx")));
  assert.ok(deriveTestPaths("/repo/src/a.js", undefined).every((p) => p.endsWith(".js")));
});
