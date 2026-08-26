<p align="center">
  <img src="./assets/banner-test-intel.svg" alt="test-intel-mcp" width="888" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@barissozudogru/test-intel-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/@barissozudogru/test-intel-mcp?style=flat-square&color=06B6D4"></a>
  <a href="https://www.npmjs.com/package/@barissozudogru/test-intel-mcp"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@barissozudogru/test-intel-mcp?style=flat-square&color=06B6D4"></a>
  <a href="https://github.com/barissozudogru/test-intel-mcp/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/barissozudogru/test-intel-mcp/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://registry.modelcontextprotocol.io/v0.1/servers/io.github.barissozudogru%2Ftest-intel/versions/latest"><img alt="MCP Registry" src="https://img.shields.io/badge/MCP_Registry-listed-0F172A?style=flat-square"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-06B6D4?style=flat-square"></a>
</p>

# test-intel-mcp

Turn JavaScript and TypeScript coverage artifacts into practical test priorities. The server reads local coverage and source files, identifies gaps, scores function complexity, and suggests focused test cases without sending code to an external service.

[Tool page](https://petri-labs.org/tools/test-intel-mcp/) · [npm](https://www.npmjs.com/package/@barissozudogru/test-intel-mcp) · Listed in the official [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.barissozudogru%2Ftest-intel/versions/latest)

![test-intel-mcp analyzing real p-limit coverage](./assets/demo.gif)

## Start in one minute

Add one local server entry to any stdio-compatible MCP client:

```json
{
  "mcpServers": {
    "test-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-intel-mcp"]
    }
  }
}
```

Then ask the client to inspect an existing coverage file:

```text
Use test-intel to analyze coverage/lcov.info, identify the highest-impact gaps,
and suggest tests for the most complex uncovered function.
```

No account, API key, or hosted service is required. File access is restricted to the directory where the server starts.

## Proof on this repository

Running the complexity tool against the real `src/paths.ts` file produces:

```text
Function complexity analysis for: src/paths.ts
Total functions analyzed: 1

Priority | Function        | Line | Cyclomatic | Branches | Loops
---------|-----------------|------|------------|----------|------
low      | deriveTestPaths | 11   | 3          | 1        | 1

Summary: 0 critical, 0 high, 0 medium, 1 low priority
```

The same server reads lcov, Istanbul JSON, and Cobertura files to surface uncovered functions, lines, and branches.

A pinned [p-limit 7.3.1 case study](./evidence/p-limit-7.3.1/) reproduces
coverage from the upstream project's 22 passing tests. `test-intel-report`
reduces its lcov artifact to two uncovered lines and one uncovered branch while
preserving the original coverage file for inspection.

If this saves you time, consider [starring the repository](https://github.com/barissozudogru/test-intel-mcp). It helps other developers find it.

## Tools

| Tool | What it answers |
|---|---|
| `analyze_test_coverage` | Which files, functions, lines, and branches remain uncovered? |
| `find_untested_functions` | Which source functions have no corresponding test file? |
| `get_function_complexity` | Which functions deserve testing attention first? |
| `suggest_test_cases` | Which happy path, boundary, error, async, and type cases should be reviewed? |

Supported coverage formats:

| Format | Common producers |
|---|---|
| lcov | Jest, Vitest, nyc, Istanbul |
| Istanbul JSON | Jest, nyc, Istanbul |
| Cobertura XML | Jest, pytest-cov, JaCoCo |

Heuristic source-to-test matching and complexity scores are prioritization signals. Native coverage data and human review remain the source of truth.

## Coverage report command

The package also includes a non-MCP command for CI and terminal use:

```bash
npx -y -p @barissozudogru/test-intel-mcp test-intel-report coverage/lcov.info
```

An explicit format can be supplied when the filename is ambiguous:

```bash
test-intel-report coverage/result.xml cobertura
```

## GitHub Action

Generate coverage with the project's own test runner, then pass the resulting artifact to the action:

```yaml
name: Test priorities

on: [pull_request]

jobs:
  test-intel:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Run tests with coverage
        run: npm ci && npm test -- --coverage
      - uses: barissozudogru/test-intel-mcp@v0.8.0
        with:
          coverage-path: coverage/lcov.info
```

The report is written to the workflow summary. The action analyzes an artifact that already exists and does not upload source or coverage data.

## Client setup

<details>
<summary>Claude Desktop, Cursor, Windsurf, Cline, and similar clients</summary>

Use the stdio configuration from the quickstart. Config file locations differ by client, but the server entry is the same:

```json
{
  "mcpServers": {
    "test-intel": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-intel-mcp"]
    }
  }
}
```

</details>

<details>
<summary>VS Code with Copilot</summary>

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "test-intel": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-intel-mcp"]
    }
  }
}
```

</details>

<details>
<summary>Streamable HTTP</summary>

Start the local endpoint:

```bash
npx @barissozudogru/test-intel-mcp --http
```

The MCP endpoint is `http://localhost:3000/mcp` and the health endpoint is `http://localhost:3000/health`. Set `PORT` to use another port.

</details>

<details>
<summary>Docker</summary>

```bash
docker build -t test-intel-mcp .
docker run -p 3000:3000 -v "$(pwd):/project" -w /project test-intel-mcp
```

Connect an HTTP client to `http://localhost:3000/mcp`.

</details>

## Local development

```bash
npm install
npm test
npm run build
node dist/index.js
```

Requirements: Node.js 18 or newer.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow.

## Security and limits

- Analysis runs locally and does not require network access.
- Paths outside the server's starting directory are rejected.
- Function discovery, source-to-test matching, and complexity scoring are heuristic.
- A missing matching test filename does not prove a function is behaviorally untested.

## License

[MIT](./LICENSE)
