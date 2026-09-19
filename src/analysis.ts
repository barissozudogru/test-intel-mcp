export interface FunctionRef {
  name: string;
  line: number;
  kind: 'function' | 'arrow' | 'method' | 'async-function' | 'async-arrow' | 'async-method';
}

export interface UntestedSource {
  sourceFile: string;
  functions: FunctionRef[];
  hasTestFile: boolean;
  testFilePaths: string[];
}

// Single shared pattern list for extracting function declarations and bodies
export const FUNCTION_PATTERNS: Array<{ re: RegExp; kind: FunctionRef['kind'] }> = [
  // async function foo(
  { re: /^\s*(?:export\s+)?(?:default\s+)?async\s+function\*?\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'async-function' },
  // function foo( / function* foo(
  { re: /^\s*(?:export\s+)?(?:default\s+)?function\*?\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'function' },
  // async method: async foo(
  { re: /^\s*(?:(?:public|private|protected|static|override|abstract)\s+)*async\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/m, kind: 'async-method' },
  // method pattern with zero or more modifiers
  { re: /^\s*(?:(?:public|private|protected|static|override|abstract|get|set)\s+)+([A-Za-z_$#][A-Za-z0-9_$]*)\s*\(/m, kind: 'method' },
  // export const foo = async (  /  export const foo = (
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*async\s*(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/m, kind: 'async-arrow' },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/m, kind: 'arrow' },
];

export function extractFunctions(content: string): FunctionRef[] {
  const lines = content.split('\n');
  const found: FunctionRef[] = [];
  const seen = new Set<string>();
  let insideBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Track block comment state
    if (insideBlockComment) {
      if (line.includes('*/')) {
        insideBlockComment = false;
      }
      continue;
    }

    // Check for block comment start (without closing on same line)
    if (line.includes('/*')) {
      if (!line.includes('*/')) {
        insideBlockComment = true;
      }
      // If /* and */ are on the same line, it is an inline comment, so do not skip
    }

    // Skip line comment lines
    if (/^\s*(\/\/|\*)/.test(line)) continue;

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

export interface FunctionComplexity {
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

export function scoreComplexity(fn: FunctionComplexity): 'critical' | 'high' | 'medium' | 'low' {
  const score = fn.cyclomaticComplexity;
  if (score >= 15) return 'critical';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

// State machine for string and comment context in brace counting
export function countBraceDepthChange(line: string, state: {
  insideSingleQuote: boolean;
  insideDoubleQuote: boolean;
  insideTemplateLiteral: boolean;
  insideBlockComment: boolean;
  insideLineComment: boolean;
  templateDepth: number; // for nested ${...} inside template literals
}): number {
  let delta = 0;
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    const next = line[i + 1];

    // Line comments end at newline (we process one line at a time)
    if (state.insideLineComment) {
      break;
    }

    // Inside block comment
    if (state.insideBlockComment) {
      if (ch === '*' && next === '/') {
        state.insideBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Inside single quote string
    if (state.insideSingleQuote) {
      if (ch === '\\') { i += 2; continue; } // escape sequence
      if (ch === "'") { state.insideSingleQuote = false; }
      i++;
      continue;
    }

    // Inside double quote string
    if (state.insideDoubleQuote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === '"') { state.insideDoubleQuote = false; }
      i++;
      continue;
    }

    // Inside template literal
    if (state.insideTemplateLiteral) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === '`') { state.insideTemplateLiteral = false; i++; continue; }
      // Template expression ${...}
      if (ch === '$' && next === '{') {
        state.templateDepth++;
        i += 2;
        continue;
      }
      if (ch === '}' && state.templateDepth > 0) {
        state.templateDepth--;
        i++;
        continue;
      }
      i++;
      continue;
    }

    // Normal code: check for string or comment starts
    if (ch === '/' && next === '/') {
      state.insideLineComment = true;
      break;
    }
    if (ch === '/' && next === '*') {
      state.insideBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") { state.insideSingleQuote = true; i++; continue; }
    if (ch === '"') { state.insideDoubleQuote = true; i++; continue; }
    if (ch === '`') { state.insideTemplateLiteral = true; i++; continue; }

    // Count braces only in normal code (not inside template expression holes)
    if (state.templateDepth === 0) {
      if (ch === '{') delta++;
      if (ch === '}') delta--;
    } else {
      // Inside template ${...}: track depth
      if (ch === '{') state.templateDepth++;
      if (ch === '}') {
        state.templateDepth--;
        if (state.templateDepth < 0) state.templateDepth = 0;
      }
    }

    i++;
  }

  // Reset line comment state at end of line
  state.insideLineComment = false;

  return delta;
}

export function extractFunctionBodies(content: string): Array<{ name: string; line: number; body: string }> {
  const lines = content.split('\n');
  const results: Array<{ name: string; line: number; body: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    let funcName: string | null = null;
    let isArrow = false;

    for (const { re, kind } of FUNCTION_PATTERNS) {
      const m = re.exec(line);
      if (m && m[1]) {
        const name = m[1];
        if (!['if', 'for', 'while', 'switch', 'catch', 'constructor', 'class'].includes(name)) {
          funcName = name;
          isArrow = kind === 'arrow' || kind === 'async-arrow';
          break;
        }
      }
    }

    if (funcName) {
      // For arrow functions, check if there is an opening brace within 2 lines
      if (isArrow) {
        let hasBrace = false;
        for (let k = i; k <= Math.min(i + 1, lines.length - 1); k++) {
          if ((lines[k] ?? '').includes('{')) { hasBrace = true; break; }
        }

        if (!hasBrace) {
          // Arrow function without braces: capture until semicolon, comma, or closing paren
          let bodyLines = '';
          let j = i;
          while (j < lines.length) {
            const l = lines[j] ?? '';
            bodyLines += l + '\n';
            if (/[;,)]/.test(l.trimEnd().slice(-1))) break;
            j++;
            if (j - i > 10) break; // short safety limit for brace-less arrows
          }
          results.push({ name: funcName, line: i + 1, body: bodyLines });
          i = j + 1;
          continue;
        }
      }

      // Use state machine for brace counting
      const braceState = {
        insideSingleQuote: false,
        insideDoubleQuote: false,
        insideTemplateLiteral: false,
        insideBlockComment: false,
        insideLineComment: false,
        templateDepth: 0,
      };

      let bodyLines = '';
      let depth = 0;
      let started = false;
      let j = i;

      while (j < lines.length) {
        const l = lines[j] ?? '';
        const delta = countBraceDepthChange(l, braceState);
        if (delta > 0 && !started) started = true;
        depth += delta;
        bodyLines += l + '\n';
        if (started && depth === 0) break;
        j++;
        if (j - i > 500) break; // safety limit
      }

      results.push({ name: funcName, line: i + 1, body: bodyLines });
      i = j + 1;
      continue;
    }
    i++;
  }
  return results;
}

export function analyzeComplexity(name: string, line: number, body: string): FunctionComplexity {
  // Remove lines that are entirely within quotes
  const filteredLines = body.split('\n').filter(l => {
    const trimmed = l.trim();
    return !(trimmed.startsWith("'") || trimmed.startsWith('"') || trimmed.startsWith('`'));
  });
  const filteredBody = filteredLines.join('\n');

  // Branch counting:
  // - Count if (decision point)
  // - Omit else (not a decision point in McCabe)
  // - Omit switch (only case labels count)
  // - Add ?? and ?. as decision points
  // - Count ternary ?, &&, ||
  const branches = (filteredBody.match(/\bif\s*\(|\s\?\s(?!\.)|\?\?|(?<!\?)\?\.|\&\&|\|\|/g) ?? []).length;

  // Loops: loops are control flow (for, while, do)
  const loops = (filteredBody.match(/\bfor\s*\(|\bwhile\s*\(|\bdo\s*\{/g) ?? []).length;

  // try+catch: 1 decision point (count try blocks only)
  const tryCatch = (filteredBody.match(/\btry\s*\{/g) ?? []).length;

  const earlyReturns = (body.match(/\breturn\b/g) ?? []).length;
  const asyncPatterns = (body.match(/\bawait\b|\bPromise\b|\bthen\s*\(|\bcatch\s*\(/g) ?? []).length;

  // Case labels as decision points
  const caseLabels = (filteredBody.match(/\bcase\s+[^:]+:/g) ?? []).length;

  // McCabe cyclomatic: 1 + decision points
  const cyclomatic = 1 + branches + loops + tryCatch + caseLabels;

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

export interface TestCaseSuggestion {
  description: string;
  rationale: string;
  category: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary' | 'async' | 'type-check';
}

export function suggestTestCases(functionBody: string, functionName: string): TestCaseSuggestion[] {
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
      rationale: 'Async function: resolved promise path must be verified.',
      category: 'async',
    });
    suggestions.push({
      description: `should reject or throw when the async operation fails`,
      rationale: 'Async function: rejected or thrown path must be covered to avoid unhandled rejections.',
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

  // Escape function name before using in RegExp
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const recursionRe = new RegExp(`\\b${escapedName}\\s*\\(`);
  if (recursionRe.test(functionBody.split('\n').slice(1).join('\n'))) {
    suggestions.push({
      description: `should handle base case to prevent infinite recursion`,
      rationale: 'Function calls itself: the termination or base case must be exercised.',
      category: 'edge-case',
    });
  }

  // Type narrowing / typeof / instanceof
  if (/typeof\s+\w+|instanceof\s+\w+/.test(functionBody)) {
    suggestions.push({
      description: `should handle different runtime types correctly`,
      rationale: 'Type checks indicate multiple accepted types: test each branch.',
      category: 'type-check',
    });
  }

  return suggestions;
}
