<div align="center">

# test-gap-mcp

**MCP server that identifies untested code and suggests test cases**

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green)
![License](https://img.shields.io/badge/License-MIT-yellow)
![MCP](https://img.shields.io/badge/Protocol-MCP-purple)
![Zero Auth](https://img.shields.io/badge/Auth-Zero%20Required-brightgreen)

</div>

---

## What It Does

`test-gap-mcp` is a Model Context Protocol server that analyzes your TypeScript and JavaScript projects to find test coverage gaps — without any external services, tokens, or authentication. It reads local files directly.

Four tools are exposed:

| Tool | Description |
|---|---|
| `analyze_test_coverage` | Parse lcov, istanbul JSON, or cobertura XML reports and surface uncovered files, functions, lines, and branches |
| `find_untested_functions` | Scan a source directory for functions with no corresponding test file |
| `get_function_complexity` | Compute cyclomatic complexity per function to prioritize what to test first |
| `suggest_test_cases` | Analyze a specific function and generate categorized test case suggestions |

---

## Setup for Claude Desktop

Add the following to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "test-gap-mcp": {
      "command": "node",
      "args": ["/path/to/test-gap-mcp/dist/index.js"]
    }
  }
}
```

Or if installed via npm:

```json
{
  "mcpServers": {
    "test-gap-mcp": {
      "command": "npx",
      "args": ["@barissozudogru/test-gap-mcp"]
    }
  }
}
```

---

## Tools

### analyze_test_coverage

Parse a coverage report and get a list of files with uncovered code.

```json
{
  "coverage_path": "./coverage/lcov.info",
  "format": "lcov"
}
```

Supported formats: `lcov` (`.info`), `istanbul` (`.json`), `cobertura` (`.xml`). Format is auto-detected from file extension when omitted.

---

### find_untested_functions

Scan a source directory and identify functions that have no test file.

```json
{
  "source_dir": "./src",
  "test_dir": "./src/__tests__",
  "extensions": [".ts", ".tsx"]
}
```

Naming conventions checked: `foo.ts` -> `foo.test.ts`, `foo.spec.ts`, `__tests__/foo.test.ts`.

---

### get_function_complexity

Get cyclomatic complexity for every function in a file, sorted by priority.

```json
{
  "file_path": "./src/utils/parser.ts"
}
```

Priority levels: `critical` (>=15), `high` (>=8), `medium` (>=4), `low` (<4).

---

### suggest_test_cases

Generate test case suggestions for a specific function.

```json
{
  "file_path": "./src/services/auth.ts",
  "function_name": "validateToken"
}
```

Categories returned: `happy-path`, `edge-case`, `error-handling`, `boundary`, `async`, `type-check`.

---

## Usage Examples

**Find everything untested in your project:**

```
Use find_untested_functions with source_dir="./src"
```

**Prioritize what to test first:**

```
Use get_function_complexity with file_path="./src/api/handler.ts"
```

**Get actionable test suggestions:**

```
Use suggest_test_cases with file_path="./src/api/handler.ts" and function_name="processRequest"
```

**Check your coverage report for gaps:**

```
Use analyze_test_coverage with coverage_path="./coverage/lcov.info"
```

---

## Requirements

- Node.js >= 18
- No external auth or network access required
- Works entirely on local files

---

## License

MIT
