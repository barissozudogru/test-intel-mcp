export interface UncoveredItem {
  file: string;
  uncoveredFunctions: string[];
  uncoveredLines: number[];
  uncoveredBranches: string[];
  lineCoverage: number;
  functionCoverage: number;
  branchCoverage: number;
}

export function parseLcov(content: string): UncoveredItem[] {
  // Accumulated per-file data (supports duplicate SF: records)
  const fileData = new Map<string, {
    uncoveredFunctions: string[];
    uncoveredLines: number[];
    totalLines: number;
    hitLines: number;
    totalFuncs: number;
    hitFuncs: number;
    // For merging: line hit counts keyed by line number
    lineHits: Map<number, number>;
    // For merging: function hit counts keyed by name
    funcHits: Map<string, number>;
    // For merging: branch taken counts keyed by line:block:branch
    branchHits: Map<string, number>;
    // Declared function names, deduped so repeated SF: records don't inflate the total
    funcNames: Set<string>;
  }>();

  let currentFile: string | null = null;

  function getOrCreate(fileName: string) {
    if (!fileData.has(fileName)) {
      fileData.set(fileName, {
        uncoveredFunctions: [],
        uncoveredLines: [],
        totalLines: 0,
        hitLines: 0,
        totalFuncs: 0,
        hitFuncs: 0,
        lineHits: new Map(),
        funcHits: new Map(),
        branchHits: new Map(),
        funcNames: new Set(),
      });
    }
    return fileData.get(fileName)!;
  }

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3);
      // Initialize entry if first time, otherwise reuse existing for merging
      getOrCreate(currentFile);
    } else if (line.startsWith('FN:') && currentFile) {
      // FN:<line>,<name>. Count each function name once so merged duplicate
      // SF: records don't double-count it and report too-low function coverage.
      const d = getOrCreate(currentFile);
      const fnName = line.slice(3).split(',')[1] ?? 'unknown';
      if (!d.funcNames.has(fnName)) {
        d.funcNames.add(fnName);
        d.totalFuncs++;
      }
      if (!d.funcHits.has(fnName)) {
        d.funcHits.set(fnName, 0);
      }
    } else if (line.startsWith('FNDA:') && currentFile) {
      // FNDA:<count>,<name>
      const [countStr, name] = line.slice(5).split(',');
      const count = parseInt(countStr ?? '0', 10);
      const fnName = name ?? 'unknown';
      const d = getOrCreate(currentFile);
      // Merge: take max hit count for this function
      const existing = d.funcHits.get(fnName) ?? 0;
      d.funcHits.set(fnName, Math.max(existing, count));
    } else if (line.startsWith('DA:') && currentFile) {
      // DA:<line>,<count>
      const parts = line.slice(3).split(',');
      const lineNo = parseInt(parts[0] ?? '0', 10);
      const count = parseInt(parts[1] ?? '0', 10);
      const d = getOrCreate(currentFile);
      // Merge: take max hit count for this line
      if (!d.lineHits.has(lineNo)) {
        d.totalLines++;
      }
      const existing = d.lineHits.get(lineNo) ?? 0;
      d.lineHits.set(lineNo, Math.max(existing, count));
    } else if (line.startsWith('BRDA:') && currentFile) {
      // BRDA:<line>,<block>,<branch>,<taken>
      const parts = line.slice(5).split(',');
      const branchLine = parts[0];
      const branchBlock = parts[1];
      const branchIdx = parts[2];
      const taken = parts[3];
      const d = getOrCreate(currentFile);
      // Merge: take max taken count for this branch ('-' means never taken)
      const key = `${branchLine}:${branchBlock}:${branchIdx}`;
      const count = taken === '-' ? 0 : parseInt(taken ?? '0', 10);
      const existing = d.branchHits.get(key) ?? 0;
      d.branchHits.set(key, Math.max(existing, count));
    } else if (line === 'end_of_record' && currentFile) {
      currentFile = null;
    }
  }

  // Finalize any open record (handled by map accumulation; end_of_record clears currentFile)
  const files: UncoveredItem[] = [];

  for (const [fileName, d] of fileData) {
    // Rebuild uncoveredLines and hitLines from merged lineHits
    let hitLines = 0;
    const uncoveredLines: number[] = [];
    for (const [lineNo, hits] of d.lineHits) {
      if (hits > 0) hitLines++;
      else uncoveredLines.push(lineNo);
    }

    // Rebuild uncoveredFunctions and hitFuncs from declared functions
    let hitFuncs = 0;
    const uncoveredFunctions: string[] = [];
    for (const fnName of d.funcNames) {
      const hits = d.funcHits.get(fnName) ?? 0;
      if (hits > 0) hitFuncs++;
      else uncoveredFunctions.push(fnName);
    }

    // Rebuild uncoveredBranches, hitBranches and totalBranches from merged branchHits
    let hitBranches = 0;
    const uncoveredBranches: string[] = [];
    for (const [key, hits] of d.branchHits) {
      if (hits > 0) hitBranches++;
      else {
        const [branchLine, branchBlock, branchIdx] = key.split(':');
        uncoveredBranches.push(`line ${branchLine} block ${branchBlock} branch ${branchIdx}`);
      }
    }
    const totalBranches = d.branchHits.size;

    const lineCoverage = d.totalLines > 0 ? Math.round((hitLines / d.totalLines) * 100) : 100;
    const functionCoverage = d.totalFuncs > 0 ? Math.round((hitFuncs / d.totalFuncs) * 100) : 100;
    const branchCoverage = totalBranches > 0 ? Math.round((hitBranches / totalBranches) * 100) : 100;

    if (uncoveredLines.length > 0 || uncoveredFunctions.length > 0 || uncoveredBranches.length > 0) {
      files.push({
        file: fileName,
        uncoveredFunctions,
        uncoveredLines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
        uncoveredBranches,
        lineCoverage,
        functionCoverage,
        branchCoverage,
      });
    }
  }

  return files;
}

export function parseIstanbul(content: string): UncoveredItem[] {
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

export function parseCobertura(content: string): UncoveredItem[] {
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

    // Compute actual function coverage from method data
    let totalFunctions = 0;
    let coveredFunctions = 0;

    // Parse methods
    const methodRe = /<method[^>]+name="([^"]+)"[^>]*>([\s\S]*?)<\/method>/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRe.exec(classBody)) !== null) {
      const methodName = methodMatch[1] ?? '';
      const methodBody = methodMatch[2] ?? '';
      totalFunctions++;
      const lineRe = /<line[^>]+hits="(\d+)"[^>]*\/>/g;
      let anyHit = false;
      let lm: RegExpExecArray | null;
      while ((lm = lineRe.exec(methodBody)) !== null) {
        if (parseInt(lm[1] ?? '0', 10) > 0) { anyHit = true; break; }
      }
      if (anyHit) {
        coveredFunctions++;
      } else {
        uncoveredFunctions.push(methodName);
      }
    }

    // Parse lines from class-level lines block, excluding method bodies
    const linesBody = classBody.replace(/<methods[\s\S]*?<\/methods>/g, '');
    const lineRe2 = /<line[^>]+number="(\d+)"[^>]+hits="(\d+)"[^>]*\/>/g;
    let lm2: RegExpExecArray | null;
    let totalLines = 0, hitLines = 0;
    while ((lm2 = lineRe2.exec(linesBody)) !== null) {
      totalLines++;
      const hits = parseInt(lm2[2] ?? '0', 10);
      if (hits > 0) hitLines++;
      else uncoveredLines.push(parseInt(lm2[1] ?? '0', 10));
    }

    // Parse branches via condition-coverage attribute
    const condRe = /condition-coverage="(\d+)%\s*\((\d+)\/(\d+)\)"/g;
    let cm: RegExpExecArray | null;
    let totalBranches = 0, hitBranches = 0;
    while ((cm = condRe.exec(linesBody)) !== null) {
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
        functionCoverage: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 100,
        branchCoverage: totalBranches > 0 ? Math.round((hitBranches / totalBranches) * 100) : 100,
      });
    }
  }
  return results;
}
