#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { deriveTestPaths } from './paths.js';
import {
  safePath,
  fileExists,
  readFile,
  walkDir,
  isTestFile,
  collectImportedBasenames,
} from './fs.js';
import {
  UncoveredItem,
  parseLcov,
  parseIstanbul,
  parseCobertura,
} from './parsers.js';
import {
  FunctionComplexity,
  UntestedSource,
  TestCaseSuggestion,
  extractFunctions,
  extractFunctionBodies,
  analyzeComplexity,
  suggestTestCases,
} from './analysis.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

const server = new McpServer({ name: 'test-intel-mcp', version: VERSION });

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
    try {
      safePath(coverage_path);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
    if (!fileExists(coverage_path)) {
      return { isError: true, content: [{ type: 'text' as const, text: `Error: File not found: ${coverage_path}` }] };
    }

    let content: string;
    try {
      content = readFile(coverage_path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text' as const, text: `Error reading file: ${msg}` }] };
    }

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
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text' as const, text: `Error parsing ${detectedFormat} coverage: ${msg}` }] };
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

    let sourceFiles: string[];
    try {
      sourceFiles = walkDir(source_dir, exts).filter(f => {
        const base = path.basename(f);
        return !base.includes('.test.') && !base.includes('.spec.');
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text' as const, text: `Error scanning source directory: ${msg}` }] };
    }

    if (sourceFiles.length === 0) {
      return { content: [{ type: 'text' as const, text: `No source files found in ${source_dir} with extensions: ${exts.join(', ')}` }] };
    }

    const allTestFiles = walkDir(test_dir ?? source_dir, exts).filter(isTestFile);

    // Build a set of test file basenames for fast lookup
    const testBasenames = new Set(allTestFiles.map(f => path.basename(f)));
    // Read each test file once and record what it imports, so the source
    // loop below can check the set instead of rescanning every test file.
    const importedBasenames = new Set<string>();
    for (const tf of allTestFiles) {
      try {
        collectImportedBasenames(readFile(tf), importedBasenames);
      } catch {
        // Skip unreadable test files
      }
    }

    const results: UntestedSource[] = [];
    let skippedFiles = 0;

    for (const srcFile of sourceFiles) {
      let content: string;
      try {
        content = readFile(srcFile);
      } catch {
        skippedFiles++;
        continue;
      }
      const functions = extractFunctions(content);
      if (functions.length === 0) continue;

      const testPaths = deriveTestPaths(srcFile, test_dir);
      const existingTests = testPaths.filter(tp => fileExists(tp));

      // Import detection matches the basename as a complete path segment
      const srcBasename = path.basename(srcFile, path.extname(srcFile));
      const importedByTest = importedBasenames.has(srcBasename);

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

    // Suppress unused variable warning
    void testBasenames;

    if (skippedFiles === sourceFiles.length) {
      return { content: [{ type: 'text' as const, text: `Error: All ${sourceFiles.length} source file(s) are outside the workspace and could not be analyzed.` }], isError: true };
    }

    if (results.length === 0) {
      const lines: string[] = [`All ${sourceFiles.length} source file(s) have corresponding tests. No gaps found.`];
      if (skippedFiles > 0) {
        lines.push(`\nWarning: ${skippedFiles} file(s) could not be read (outside workspace or inaccessible).`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('') }] };
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
      for (const tp of r.testFilePaths) {
        lines.push(`    ${tp}`);
      }
      lines.push('');
    }

    if (skippedFiles > 0) {
      lines.push(`\nWarning: ${skippedFiles} file(s) could not be read (outside workspace or inaccessible).`);
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
    try {
      safePath(file_path);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
    if (!fileExists(file_path)) {
      return { isError: true, content: [{ type: 'text' as const, text: `Error: File not found: ${file_path}` }] };
    }

    let content: string;
    try {
      content = readFile(file_path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text' as const, text: `Error reading file: ${msg}` }] };
    }

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
    try {
      safePath(file_path);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
    if (!fileExists(file_path)) {
      return { isError: true, content: [{ type: 'text' as const, text: `Error: File not found: ${file_path}` }] };
    }

    let content: string;
    try {
      content = readFile(file_path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: 'text' as const, text: `Error reading file: ${msg}` }] };
    }

    const bodies = extractFunctionBodies(content);
    const match = bodies.find(b => b.name === function_name);

    if (!match) {
      const available = bodies.map(b => b.name).join(', ');
      return {
        isError: true,
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

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write([
      'test-intel-mcp - local test coverage intelligence over MCP',
      '',
      'Usage:',
      '  test-intel-mcp            Start the stdio MCP server',
      '  test-intel-mcp --http     Start the HTTP transport',
      '',
      'Source and documentation:',
      '  https://github.com/barissozudogru/test-intel-mcp',
      '',
    ].join('\n'));
    return;
  }

  const useHttp = process.argv.includes('--http') || (process.env.TRANSPORT ?? '').toLowerCase() === 'http';

  if (useHttp) {
    const app = express();
    app.use(express.json());
    const port = parseInt(process.env.PORT || '3000', 10);

    app.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', server: 'test-intel-mcp', version: VERSION });
    });

    app.listen(port, () => {
      process.stderr.write(`test-intel-mcp v${VERSION} listening on http://0.0.0.0:${port}/mcp\n`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`test-intel-mcp v${VERSION} running on stdio\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
