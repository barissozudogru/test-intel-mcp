#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(filePath: string): string {
  return fs.readFileSync(path.resolve(filePath), 'utf-8');
}

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(path.resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

function walkDir(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) return results;

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
      results.push(...walkDir(full, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tool 1: analyze_test_coverage
// ---------------------------------------------------------------------------

interface UncoveredItem {
  file: string;
  uncoveredFunctions: string[];
  uncoveredLines: number[];
  uncoveredBranches: string[];
  lineCoverage: number;
  functionCoverage: number;
  branchCoverage: number;
}

function parseLcov(content: string): UncoveredItem[] {
  const files: UncoveredItem[] = [];
  let current: UncoveredItem | null = null;
  const totalLines: Record<string, number> = {};
  const hitLines: Record<string, number> = {};
  const totalFuncs: Record<string, number> = {};
  const hitFuncs: Record<string, number> = {};
  const totalBranches: Record<string, number> = {};
  const hitBranches: Record<string, number> = {};

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      current = {
        file: line.slice(3),
        uncoveredFunctions: [],
        uncoveredLines: [],
        uncoveredBranches: [],
        lineCoverage: 0,
        functionCoverage: 0,
        branchCoverage: 0,
      };
      totalLines[current.file] = 0;
      hitLines[current.file] = 0;
      totalFuncs[current.file] = 0;
      hitFuncs[current.file] = 0;
      totalBranches[current.file] = 0;
      hitBranches[current.file] = 0;
    } else if (line.startsWith('FN:') && current) {
      // FN:<line>,<name>
      totalFuncs[current.file] = (totalFuncs[current.file] || 0) + 1;
    } else if (line.startsWith('FNDA:') && current) {
      // FNDA:<count>,<name>
      const [countStr, name] = line.slice(5).split(',');
      const count = parseInt(countStr, 10);
      if (count === 0) {
        current.uncoveredFunctions.push(name ?? 'unknown');
      } else {
        hitFuncs[current.file] = (hitFuncs[current.file] || 0) + 1;
      }
    } else if (line.startsWith('DA:') && current) {
      // DA:<line>,<count>
      const parts = line.slice(3).split(',');
      const lineNo = parseInt(parts[0] ?? '0', 10);
      const count = parseInt(parts[1] ?? '0', 10);
      totalLines[current.file] = (totalLines[current.file] || 0) + 1;
      if (count === 0) {
        current.uncoveredLines.push(lineNo);
      } else {
        hitLines[current.file] = (hitLines[current.file] || 0) + 1;
      }
    } else if (line.startsWith('BRDA:') && current) {
      // BRDA:<line>,<block>,<branch>,<taken>
      const parts = line.slice(5).split(',');
      const branchLine = parts[0];
      const branchBlock = parts[1];
      const branchIdx = parts[2];
      const taken = parts[3];
      totalBranches[current.file] = (totalBranches[current.file] || 0) + 1;
      if (taken === '0' || taken === '-') {
        current.uncoveredBranches.push(`line ${branchLine} block ${branchBlock} branch ${branchIdx}`);
      } else {
        hitBranches[current.file] = (hitBranches[current.file] || 0) + 1;
      }
    } else if (line === 'end_of_record' && current) {
      const tl = totalLines[current.file] || 1;
      const tf = totalFuncs[current.file] || 1;
      const tb = totalBranches[current.file] || 1;
      current.lineCoverage = Math.round(((hitLines[current.file] || 0) / tl) * 100);
      current.functionCoverage = Math.round(((hitFuncs[current.file] || 0) / tf) * 100);
      current.branchCoverage = Math.round(((hitBranches[current.file] || 0) / tb) * 100);
      if (current.uncoveredLines.length > 0 || current.uncoveredFunctions.length > 0 || current.uncoveredBranches.length > 0) {
        files.push(current);
      }
      current = null;
    }
  }
  return files;
}

function parseIstanbul(content: string): UncoveredItem[] {
  const data = JSON.parse(content) as Record<string, {
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, number[]>;
    fnMap: Record<string, { name: string; loc: { start: { line: number } } }>;
    statementMap: Record<string, { start: { line: number } }>;
    branchMap: Record<string, { loc: { start: { line: number } } }>;
  }>;

  const results: UncoveredItem[] = [];

  for (const [filePath, cov] of Object.entries(data)) {
    const uncoveredFunctions: string[] = [];
    const uncoveredLines: number[] = [];
    const uncoveredBranches: string[] = [];

    let totalStmts = 0, hitStmts = 0;
    let totalFuncs = 0, hitFuncs = 0;
    let totalBranches = 0, hitBranches = 0;

    for (const [id, count] of Object.entries(cov.s ?? {})) {
      totalStmts++;
      if (count > 0) hitStmts++;
      else {
        const map = cov.statementMap?.[id];
        if (map) uncoveredLines.push(map.start.line);
      }
    }

    for (const [id, count] of Object.entries(cov.f ?? {})) {
      totalFuncs++;
      if (count > 0) hitFuncs++;
      else {
        const fn = cov.fnMap?.[id];
        uncoveredFunctions.push(fn?.name ?? `function_${id}`);
      }
    }

    for (const [id, counts] of Object.entries(cov.b ?? {})) {
      for (let i = 0; i < counts.length; i++) {
        totalBranches++;
        if ((counts[i] ?? 0) > 0) hitBranches++;
        else {
          const bmap = cov.branchMap?.[id];
          uncoveredBranches.push(`branch ${i} at line ${bmap?.loc?.start?.line ?? '?'}`);
        }
      }
    }

    if (uncoveredLines.length > 0 || uncoveredFunctions.length > 0 || uncoveredBranches.length > 0) {
      results.push({
        file: filePath,
        uncoveredFunctions,
        uncoveredLines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
        uncoveredBranches,
        lineCoverage: totalStmts > 0 ? Math.round((hitStmts / totalStmts) * 100) : 100,
        functionCoverage: totalFuncs > 0 ? Math.round((hitFuncs / totalFuncs) * 100) : 100,
        branchCoverage: totalBranches > 0 ? Math.round((hitBranches / totalBranches) * 100) : 100,
      });
    }
  }
  return results;
}

function parseCobertura(content: string): UncoveredItem[] {
  const results: UncoveredItem[] = [];

  // Extract each <class> block
  const classRe = /<class[^>]+filename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g;
  let classMatch: RegExpExecArray | null;

  while ((classMatch = classRe.exec(content)) !== null) {
    const fileName = classMatch[1] ?? '';
    const classBody = classMatch[2] ?? '';

    const uncoveredFunctions: string[] = [];
    const uncoveredLines: number[] = [];
    const uncoveredBranches: string[] = [];

    // Parse methods
    const methodRe = /<method[^>]+name="([^"]+)"[^>]*>([\s\S]*?)<\/method>/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRe.exec(classBody)) !== null) {
      const methodName = methodMatch[1] ?? '';
      const methodBody = methodMatch[2] ?? '';
      const lineRe = /<line[^>]+hits="(\d+)"[^>]*\/>/g;
      let anyHit = false;
      let lm: RegExpExecArray | null;
      while ((lm = lineRe.exec(methodBody)) !== null) {
        if (parseInt(lm[1] ?? '0', 10) > 0) { anyHit = true; break; }
      }
      if (!anyHit) uncoveredFunctions.push(methodName);
    }

    // Parse lines
    const lineRe2 = /<line[^>]+number="(\d+)"[^>]+hits="(\d+)"[^>]*\/>/g;
    let lm2: RegExpExecArray | null;
    let totalLines = 0, hitLines = 0;
    while ((lm2 = lineRe2.exec(classBody)) !== null) {
      totalLines++;
      const hits = parseInt(lm2[2] ?? '0', 10);
      if (hits > 0) hitLines++;
      else uncoveredLines.push(parseInt(lm2[1] ?? '0', 10));
    }

    // Parse branches via condition-coverage attribute
    const condRe = /condition-coverage="(\d+)%\s*\((\d+)\/(\d+)\)"/g;
    let cm: RegExpExecArray | null;
    let totalBranches = 0, hitBranches = 0;
    while ((cm = condRe.exec(classBody)) !== null) {
      const hit = parseInt(cm[2] ?? '0', 10);
      const total = parseInt(cm[3] ?? '0', 10);
      hitBranches += hit;
      totalBranches += total;
      if (hit < total) {
        uncoveredBranches.push(`${total - hit} branch(es) uncovered`);
      }
    }

    if (uncoveredLines.length > 0 || uncoveredFunctions.length > 0 || uncoveredBranches.length > 0) {
      results.push({
        file: fileName,
        uncoveredFunctions,
        uncoveredLines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
        uncoveredBranches,
        lineCoverage: totalLines > 0 ? Math.round((hitLines / totalLines) * 100) : 100,
        functionCoverage: 100,
        branchCoverage: totalBranches > 0 ? Math.round((hitBranches / totalBranches) * 100) : 100,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tool 2: find_untested_functions
// ---------------------------------------------------------------------------

interface FunctionRef {
  name: string;
  line: number;
  kind: 'function' | 'arrow' | 'method' | 'async-function' | 'async-arrow' | 'async-method';
}

interface UntestedSource {
  sourceFile: string;
  functions: FunctionRef[];
  hasTestFile: boolean;
  testFilePaths: string[];
}

const FUNCTION_PATTERNS: Array<{ re: RegExp; kind: FunctionRef['kind'] }> = [
  // async function foo(
  { re: /^\s*(?:export\s+)?(?:default\s+)?async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'async-function' },
  // function foo(
  { re: /^\s*(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'function' },
  // async method or method in class: async foo(  /  foo(
  { re: /^\s*(?:(?:public|private|protected|static|override|abstract)\s+)*async\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'async-method' },
  { re: /^\s*(?:(?:public|private|protected|static|override|abstract)\s+)+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'method' },
  // export const foo = async (  /  export const foo = (
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*async\s*(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/m, kind: 'async-arrow' },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/m, kind: 'arrow' },
];

function extractFunctions(content: string): FunctionRef[] {
  const lines = content.split('\n');
  const found: FunctionRef[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Skip comment lines
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;

    for (const { re, kind } of FUNCTION_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        const name = m[1];
        if (!name) continue;
        // Skip constructors, common non-function keywords
        if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) continue;
        const key = `${name}:${i + 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ name, line: i + 1, kind });
          break;
        }
      }
    }
  }
  return found;
}

function deriveTestPaths(sourceFile: string, testDir: string | undefined): string[] {
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
  return candidates;
}

// ---------------------------------------------------------------------------
// Tool 3: get_function_complexity
// ---------------------------------------------------------------------------

interface FunctionComplexity {
  name: string;
  line: number;
  cyclomaticComplexity: number;
  branches: number;
  loops: number;
  tryCatch: number;
  earlyReturns: number;
  asyncPatterns: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

function scoreComplexity(fn: FunctionComplexity): 'critical' | 'high' | 'medium' | 'low' {
  const score = fn.cyclomaticComplexity;
  if (score >= 15) return 'critical';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function extractFunctionBodies(content: string): Array<{ name: string; line: number; body: string }> {
  const lines = content.split('\n');
  const results: Array<{ name: string; line: number; body: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Match function declarations with brace on same or next line
    const funcMatch =
      /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(line) ??
      /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/.exec(line) ??
      /^\s*(?:(?:public|private|protected|static|override|abstract)\s+)*(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(line);

    if (funcMatch) {
      const name = funcMatch[1];
      if (name && !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'class'].includes(name)) {
        // Collect body: find opening brace and match closing
        let bodyLines = '';
        let depth = 0;
        let started = false;
        let j = i;
        while (j < lines.length) {
          const l = lines[j] ?? '';
          for (const ch of l) {
            if (ch === '{') { depth++; started = true; }
            if (ch === '}') depth--;
          }
          bodyLines += l + '\n';
          if (started && depth === 0) break;
          j++;
          if (j - i > 500) break; // safety limit
        }
        results.push({ name, line: i + 1, body: bodyLines });
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return results;
}

function analyzeComplexity(name: string, line: number, body: string): FunctionComplexity {
  const branches = (body.match(/\bif\s*\(|\}\s*else\b|\bswitch\s*\(|\bcase\s+[^:]+:|\s\?\s|&&|\|\|/g) ?? []).length;
  const loops = (body.match(/\bfor\s*\(|\bwhile\s*\(|\bdo\s*\{|\bforEach\b|\bmap\b|\bfilter\b|\breduce\b/g) ?? []).length;
  const tryCatch = (body.match(/\btry\s*\{|\bcatch\s*\(/g) ?? []).length;
  const earlyReturns = (body.match(/\breturn\b/g) ?? []).length;
  const asyncPatterns = (body.match(/\bawait\b|\bPromise\b|\bthen\s*\(|\bcatch\s*\(/g) ?? []).length;

  // McCabe cyclomatic: 1 + decision points
  const cyclomatic = 1 + branches + loops + tryCatch;

  const fn: FunctionComplexity = {
    name,
    line,
    cyclomaticComplexity: cyclomatic,
    branches,
    loops,
    tryCatch,
    earlyReturns,
    asyncPatterns,
    priority: 'low',
  };
  fn.priority = scoreComplexity(fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Tool 4: suggest_test_cases
// ---------------------------------------------------------------------------

interface TestCaseSuggestion {
  description: string;
  rationale: string;
  category: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary' | 'async' | 'type-check';
}

function suggestTestCases(functionBody: string, functionName: string): TestCaseSuggestion[] {
  const suggestions: TestCaseSuggestion[] = [];

  // Happy path always
  suggestions.push({
    description: `should return expected result for valid input`,
    rationale: 'Baseline test verifying the function works under normal conditions.',
    category: 'happy-path',
  });

  // Detect parameters from signature line
  const signatureMatch = /function\s+\w+\s*\(([^)]*)\)|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|\w+)\s*=>/.exec(functionBody);
  const paramStr = signatureMatch?.[1] ?? signatureMatch?.[2] ?? '';
  const params = paramStr.split(',').map(p => p.trim()).filter(Boolean);

  if (params.length > 0) {
    suggestions.push({
      description: `should handle missing or undefined parameters gracefully`,
      rationale: `Function accepts parameters (${params.join(', ')}). Callers may omit them.`,
      category: 'edge-case',
    });
  }

  // String params
  if (/:\s*string|param.*string/i.test(functionBody) || /str|name|path|url|key|id/i.test(paramStr)) {
    suggestions.push({
      description: `should handle empty string input`,
      rationale: 'String parameters should be validated against empty strings.',
      category: 'boundary',
    });
  }

  // Number params
  if (/:\s*number|num|count|size|limit|index|offset/i.test(paramStr)) {
    suggestions.push({
      description: `should handle zero and negative number inputs`,
      rationale: 'Numeric parameters can receive zero or negative values from callers.',
      category: 'boundary',
    });
  }

  // Array params
  if (/Array|string\[\]|number\[\]|\[\]/.test(functionBody) || /arr|list|items|elements/i.test(paramStr)) {
    suggestions.push({
      description: `should handle empty array input`,
      rationale: 'Array parameters must handle the empty-array edge case without throwing.',
      category: 'edge-case',
    });
    suggestions.push({
      description: `should handle array with a single element`,
      rationale: 'Single-element arrays can expose off-by-one logic errors.',
      category: 'boundary',
    });
  }

  // Null/undefined checks
  if (/\bnull\b|\bundefined\b|\?\./.test(functionBody)) {
    suggestions.push({
      description: `should handle null or undefined values`,
      rationale: 'Code contains null/undefined guards indicating these are expected inputs.',
      category: 'edge-case',
    });
  }

  // Throws
  const throwMatches = functionBody.match(/throw\s+new\s+(\w+)\s*\(([^)]*)\)/g) ?? [];
  for (const t of throwMatches) {
    const em = /throw\s+new\s+(\w+)\s*\(([^)]*)\)/.exec(t);
    const errType = em?.[1] ?? 'Error';
    suggestions.push({
      description: `should throw ${errType} when preconditions are violated`,
      rationale: `Function explicitly throws \`${errType}\`. The error path needs coverage.`,
      category: 'error-handling',
    });
  }

  // Async / await
  if (/\basync\b|\bawait\b/.test(functionBody)) {
    suggestions.push({
      description: `should resolve with expected value on success`,
      rationale: 'Async function — resolved promise path must be verified.',
      category: 'async',
    });
    suggestions.push({
      description: `should reject or throw when the async operation fails`,
      rationale: 'Async function — rejected/thrown path must be covered to avoid unhandled rejections.',
      category: 'async',
    });
  }

  // Promise.then
  if (/\.then\s*\(/.test(functionBody)) {
    suggestions.push({
      description: `should handle Promise rejection in .then() chain`,
      rationale: 'Promise chain without .catch() is a common source of uncaught errors.',
      category: 'error-handling',
    });
  }

  // Conditional branches
  const ifCount = (functionBody.match(/\bif\s*\(/g) ?? []).length;
  const elseCount = (functionBody.match(/\}\s*else\b/g) ?? []).length;
  if (ifCount > 0) {
    suggestions.push({
      description: `should cover all ${ifCount} conditional branch(es) (true/false paths)`,
      rationale: `There ${ifCount === 1 ? 'is 1 if statement' : `are ${ifCount} if statements`} creating branch points that need separate test coverage.`,
      category: 'edge-case',
    });
  }
  if (elseCount > 0) {
    suggestions.push({
      description: `should verify the else/fallback behavior`,
      rationale: 'Else branches often contain default or error handling logic that is skipped by happy-path tests.',
      category: 'edge-case',
    });
  }

  // Switch
  if (/\bswitch\s*\(/.test(functionBody)) {
    const caseCount = (functionBody.match(/\bcase\s+/g) ?? []).length;
    suggestions.push({
      description: `should handle all ${caseCount} switch cases including default`,
      rationale: 'Each switch case is a branch that requires dedicated test coverage.',
      category: 'edge-case',
    });
  }

  // Recursion
  const recursionRe = new RegExp(`\\b${functionName}\\s*\\(`);
  if (recursionRe.test(functionBody.split('\n').slice(1).join('\n'))) {
    suggestions.push({
      description: `should handle base case to prevent infinite recursion`,
      rationale: 'Function calls itself — the termination/base case must be exercised.',
      category: 'edge-case',
    });
  }

  // Type narrowing / typeof / instanceof
  if (/typeof\s+\w+|instanceof\s+\w+/.test(functionBody)) {
    suggestions.push({
      description: `should handle different runtime types correctly`,
      rationale: 'typeof/instanceof checks indicate multiple accepted types — test each branch.',
      category: 'type-check',
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: 'test-gap-mcp', version: '0.1.0' });

// Tool 1: analyze_test_coverage
server.registerTool(
  'analyze_test_coverage',
  {
    title: 'Analyze Test Coverage',
    description: 'Parse a coverage report (lcov, istanbul JSON, or cobertura XML) and return uncovered files, functions, lines, and branch gaps.',
    inputSchema: z.object({
      coverage_path: z.string().describe('Path to the coverage file (lcov.info, coverage-summary.json, coverage.xml, etc.)'),
      format: z.enum(['lcov', 'istanbul', 'cobertura']).optional().describe('Coverage format. Auto-detected from file extension if omitted.'),
    }),
  },
  async ({ coverage_path, format }) => {
    if (!fileExists(coverage_path)) {
      return { content: [{ type: 'text' as const, text: `Error: File not found: ${coverage_path}` }] };
    }

    const content = readFile(coverage_path);
    const ext = path.extname(coverage_path).toLowerCase();

    let detectedFormat = format;
    if (!detectedFormat) {
      if (ext === '.info' || coverage_path.endsWith('lcov.info')) detectedFormat = 'lcov';
      else if (ext === '.json') detectedFormat = 'istanbul';
      else if (ext === '.xml') detectedFormat = 'cobertura';
      else detectedFormat = 'lcov';
    }

    let uncovered: UncoveredItem[];
    try {
      if (detectedFormat === 'lcov') uncovered = parseLcov(content);
      else if (detectedFormat === 'istanbul') uncovered = parseIstanbul(content);
      else uncovered = parseCobertura(content);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error parsing ${detectedFormat} coverage: ${String(err)}` }] };
    }

    if (uncovered.length === 0) {
      return { content: [{ type: 'text' as const, text: 'All files have full coverage. No gaps found.' }] };
    }

    const lines: string[] = [
      `Coverage gaps found in ${uncovered.length} file(s):`,
      '',
    ];

    for (const item of uncovered) {
      lines.push(`File: ${item.file}`);
      lines.push(`  Line coverage:     ${item.lineCoverage}%`);
      lines.push(`  Function coverage: ${item.functionCoverage}%`);
      lines.push(`  Branch coverage:   ${item.branchCoverage}%`);

      if (item.uncoveredFunctions.length > 0) {
        lines.push(`  Untested functions (${item.uncoveredFunctions.length}): ${item.uncoveredFunctions.join(', ')}`);
      }
      if (item.uncoveredLines.length > 0) {
        const lineList = item.uncoveredLines.length > 20
          ? `${item.uncoveredLines.slice(0, 20).join(', ')} ... (+${item.uncoveredLines.length - 20} more)`
          : item.uncoveredLines.join(', ');
        lines.push(`  Uncovered lines: ${lineList}`);
      }
      if (item.uncoveredBranches.length > 0) {
        const branchList = item.uncoveredBranches.slice(0, 10).join(', ');
        lines.push(`  Uncovered branches: ${branchList}${item.uncoveredBranches.length > 10 ? ` (+${item.uncoveredBranches.length - 10} more)` : ''}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

// Tool 2: find_untested_functions
server.registerTool(
  'find_untested_functions',
  {
    title: 'Find Untested Functions',
    description: 'Scan source files for function/method declarations and identify those with no corresponding test file.',
    inputSchema: z.object({
      source_dir: z.string().describe('Directory containing source files to scan.'),
      test_dir: z.string().optional().describe('Directory containing test files. Defaults to same directory as source.'),
      extensions: z.array(z.string()).optional().describe('File extensions to include, e.g. [".ts", ".js"]. Defaults to [".ts", ".tsx", ".js", ".jsx"].'),
    }),
  },
  async ({ source_dir, test_dir, extensions }) => {
    const exts = extensions ?? ['.ts', '.tsx', '.js', '.jsx'];

    const sourceFiles = walkDir(source_dir, exts).filter(f => {
      const base = path.basename(f);
      return !base.includes('.test.') && !base.includes('.spec.');
    });

    if (sourceFiles.length === 0) {
      return { content: [{ type: 'text' as const, text: `No source files found in ${source_dir} with extensions: ${exts.join(', ')}` }] };
    }

    const allTestFiles = test_dir
      ? walkDir(test_dir, exts)
      : walkDir(source_dir, exts).filter(f => {
          const base = path.basename(f);
          return base.includes('.test.') || base.includes('.spec.');
        });

    // Build a set of test file basenames for fast lookup
    const testBasenames = new Set(allTestFiles.map(f => path.basename(f)));
    // Also build content index for import detection
    const testContents = new Map<string, string>();
    for (const tf of allTestFiles) {
      testContents.set(tf, readFile(tf));
    }

    const results: UntestedSource[] = [];

    for (const srcFile of sourceFiles) {
      const content = readFile(srcFile);
      const functions = extractFunctions(content);
      if (functions.length === 0) continue;

      const testPaths = deriveTestPaths(srcFile, test_dir);
      const existingTests = testPaths.filter(tp => fileExists(tp));

      // Check if any test file imports this source
      const srcBasename = path.basename(srcFile, path.extname(srcFile));
      const importedByTest = allTestFiles.some(tf => {
        const tc = testContents.get(tf) ?? '';
        return tc.includes(`/${srcBasename}`) || tc.includes(`'${srcBasename}'`) || tc.includes(`"${srcBasename}"`);
      });

      const hasTestFile = existingTests.length > 0 || importedByTest;

      if (!hasTestFile) {
        results.push({
          sourceFile: srcFile,
          functions,
          hasTestFile: false,
          testFilePaths: testPaths,
        });
      }
    }

    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: `All ${sourceFiles.length} source file(s) have corresponding tests. No gaps found.` }] };
    }

    const lines: string[] = [
      `Found ${results.length} source file(s) with no test coverage:`,
      '',
    ];

    for (const r of results) {
      lines.push(`Source: ${r.sourceFile}`);
      lines.push(`  Functions without tests (${r.functions.length}):`);
      for (const fn of r.functions) {
        lines.push(`    - ${fn.name} (line ${fn.line}, ${fn.kind})`);
      }
      lines.push(`  Expected test file(s):`);
      for (const tp of r.testFilePaths.slice(0, 3)) {
        lines.push(`    ${tp}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

// Tool 3: get_function_complexity
server.registerTool(
  'get_function_complexity',
  {
    title: 'Get Function Complexity',
    description: 'Analyze a file\'s functions for cyclomatic complexity to prioritize which functions need tests most urgently.',
    inputSchema: z.object({
      file_path: z.string().describe('Path to the source file to analyze.'),
    }),
  },
  async ({ file_path }) => {
    if (!fileExists(file_path)) {
      return { content: [{ type: 'text' as const, text: `Error: File not found: ${file_path}` }] };
    }

    const content = readFile(file_path);
    const bodies = extractFunctionBodies(content);

    if (bodies.length === 0) {
      return { content: [{ type: 'text' as const, text: `No functions found in ${file_path}` }] };
    }

    const complexities: FunctionComplexity[] = bodies.map(b => analyzeComplexity(b.name, b.line, b.body));
    complexities.sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);

    const lines: string[] = [
      `Function complexity analysis for: ${file_path}`,
      `Total functions analyzed: ${complexities.length}`,
      '',
      'Priority | Function                        | Line  | Cyclomatic | Branches | Loops | Try/Catch | Returns | Async',
      '---------|--------------------------------|-------|-----------|----------|-------|-----------|---------|------',
    ];

    for (const fn of complexities) {
      const name = fn.name.padEnd(30);
      const line = String(fn.line).padEnd(5);
      const cyc = String(fn.cyclomaticComplexity).padEnd(9);
      const br = String(fn.branches).padEnd(8);
      const lp = String(fn.loops).padEnd(5);
      const tc = String(fn.tryCatch).padEnd(9);
      const rt = String(fn.earlyReturns).padEnd(7);
      const as = String(fn.asyncPatterns);
      lines.push(`${fn.priority.padEnd(8)} | ${name} | ${line} | ${cyc} | ${br} | ${lp} | ${tc} | ${rt} | ${as}`);
    }

    const criticalCount = complexities.filter(f => f.priority === 'critical').length;
    const highCount = complexities.filter(f => f.priority === 'high').length;

    lines.push('');
    lines.push(`Summary: ${criticalCount} critical, ${highCount} high, ${complexities.filter(f => f.priority === 'medium').length} medium, ${complexities.filter(f => f.priority === 'low').length} low priority`);

    if (criticalCount > 0 || highCount > 0) {
      lines.push('');
      lines.push('Recommended: Write tests for critical and high priority functions first.');
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

// Tool 4: suggest_test_cases
server.registerTool(
  'suggest_test_cases',
  {
    title: 'Suggest Test Cases',
    description: 'Analyze a specific function and generate structured test case suggestions based on its logic, branches, and type signatures.',
    inputSchema: z.object({
      file_path: z.string().describe('Path to the source file containing the function.'),
      function_name: z.string().describe('Name of the function to analyze.'),
    }),
  },
  async ({ file_path, function_name }) => {
    if (!fileExists(file_path)) {
      return { content: [{ type: 'text' as const, text: `Error: File not found: ${file_path}` }] };
    }

    const content = readFile(file_path);
    const bodies = extractFunctionBodies(content);
    const match = bodies.find(b => b.name === function_name);

    if (!match) {
      const available = bodies.map(b => b.name).join(', ');
      return {
        content: [{
          type: 'text' as const,
          text: `Function '${function_name}' not found in ${file_path}.\nAvailable functions: ${available || 'none'}`,
        }],
      };
    }

    const suggestions = suggestTestCases(match.body, function_name);
    const complexity = analyzeComplexity(match.name, match.line, match.body);

    const lines: string[] = [
      `Test case suggestions for: ${function_name}`,
      `File: ${file_path} (line ${match.line})`,
      `Complexity: ${complexity.cyclomaticComplexity} (${complexity.priority} priority)`,
      '',
      `Suggested test cases (${suggestions.length}):`,
      '',
    ];

    const byCategory = new Map<string, TestCaseSuggestion[]>();
    for (const s of suggestions) {
      const cat = byCategory.get(s.category) ?? [];
      cat.push(s);
      byCategory.set(s.category, cat);
    }

    for (const [category, items] of byCategory) {
      lines.push(`[${category.toUpperCase()}]`);
      for (const item of items) {
        lines.push(`  - ${item.description}`);
        lines.push(`    Rationale: ${item.rationale}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('test-gap-mcp server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
