import * as path from 'node:path';

/**
 * Candidate locations for a source file's tests.
 *
 * Without an explicit test_dir the target directory is the source directory, so
 * the candidate list contained each path twice. That mattered beyond looking
 * untidy: the report shows a limited number of candidates, and the repeats
 * pushed the __tests__ locations out of view entirely.
 */
export function deriveTestPaths(sourceFile: string, testDir: string | undefined): string[] {
  const basename = path.basename(sourceFile, path.extname(sourceFile));
  const ext = path.extname(sourceFile);
  const dir = testDir ? path.resolve(testDir) : path.dirname(path.resolve(sourceFile));
  const sourceDir = path.dirname(path.resolve(sourceFile));

  const candidates: string[] = [];
  for (const testExt of ['.test', '.spec']) {
    candidates.push(path.join(dir, `${basename}${testExt}${ext}`));
    candidates.push(path.join(sourceDir, `${basename}${testExt}${ext}`));
    candidates.push(path.join(sourceDir, '__tests__', `${basename}${testExt}${ext}`));
    candidates.push(path.join(dir, '__tests__', `${basename}${testExt}${ext}`));
  }

  // Without an explicit test_dir, `dir` and `sourceDir` are the same directory,
  // so half of these are duplicates. That mattered beyond looking untidy: the
  // report shows only the first few candidates, and the repeats pushed the
  // __tests__ locations out of view.
  return [...new Set(candidates)];
}
