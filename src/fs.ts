import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSafePath } from './safe-path.js';

export const PROJECT_ROOT = fs.realpathSync(process.cwd());
export const safePath = createSafePath(PROJECT_ROOT);

export function readFile(filePath: string): string {
  return fs.readFileSync(safePath(filePath), 'utf-8');
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(safePath(filePath));
    return true;
  } catch {
    return false;
  }
}

// Track visited directories to prevent symlink loops, and limit search depth.
export function walkDir(
  dir: string,
  extensions: string[],
  visited = new Set<string>(),
  depth = 0,
  maxDepth = 50
): string[] {
  const results: string[] = [];
  if (depth > maxDepth) return results;

  let resolved: string;
  try {
    resolved = safePath(dir);
  } catch {
    return results;
  }

  if (visited.has(resolved)) return results;
  visited.add(resolved);

  if (!fs.existsSync(resolved)) return results;

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
      results.push(...walkDir(full, extensions, visited, depth + 1, maxDepth));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

// Only a real test file may mark a source as tested: a basename carrying
// .test. or .spec., or any file under a __tests__ directory. An explicit
// test_dir also contains helpers and fixtures that import source modules,
// and treating those as tests made their imports hide missing tests.
export function isTestFile(file: string): boolean {
  const base = path.basename(file);
  if (base.includes('.test.') || base.includes('.spec.')) return true;
  return file.split(path.sep).includes('__tests__');
}

// Import detection records the final path segment of every module specifier
// a test file references, both as written and without one letters-only
// extension, so './thing' and './thing.js' both point at thing.ts. Collecting
// the segments once lets each source file do a set lookup instead of running
// a fresh regular expression over the full text of every test file, which
// made the tool cost sources * tests in scanned bytes.
export const IMPORT_SPECIFIER_RE = /(?:from\s+|require\s*\(\s*)['"]([^'"]*\/[^'"]*)['"]/g;

export function collectImportedBasenames(content: string, imported: Set<string>): void {
  for (const match of content.matchAll(IMPORT_SPECIFIER_RE)) {
    const specifier = match[1] ?? '';
    const segment = specifier.slice(specifier.lastIndexOf('/') + 1);
    if (segment === '') continue;
    imported.add(segment);
    const withoutExtension = segment.replace(/\.[a-zA-Z]+$/, '');
    if (withoutExtension !== segment) imported.add(withoutExtension);
  }
}
