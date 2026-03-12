<p align="center">
  <img src="./assets/banner-test-intel.svg" alt="test-intel-mcp" width="888" />
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/npm-0.4.0-06B6D4?style=flat-square&logo=npm&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-06B6D4?style=flat-square" />
  <img alt="MCP Server" src="https://img.shields.io/badge/MCP-Server-0F172A?style=flat-square" />
  <img alt="No Auth" src="https://img.shields.io/badge/No_Auth_Required-06B6D4?style=flat-square" />
</p>

Test coverage intelligence MCP server for TypeScript and JavaScript projects. Analyzes coverage reports, detects untested functions, and scores cyclomatic complexity — all locally, with no tokens, no external services, and no authentication required.

Compatible with: Claude Desktop | Claude Code | Cursor | Windsurf | VS Code | Cline | Continue | Zed | JetBrains | ChatGPT

---

## Tools

| Tool | Description |
|---|---|
| `analyze_test_coverage` | Parse lcov, istanbul JSON, or cobertura XML reports and surface uncovered files, functions, lines, and branches |
| `find_untested_functions` | Scan a source directory for functions with no corresponding test file |
| `get_function_complexity` | Compute cyclomatic complexity per function to prioritize what to test first |
| `suggest_test_cases` | Analyze a specific function and generate categorized test case suggestions |

---

## Setup

### Option A: stdio (local — recommended for most clients)

#### Claude Desktop

Config file: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

#### Claude Code

```bash
claude mcp add test-intel -- npx -y @barissozudogru/test-intel-mcp
```

#### Cursor

Config file: `~/.cursor/mcp.json`

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

#### Windsurf

Config file: `~/.codeium/windsurf/mcp_config.json`

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

#### VS Code + Copilot

Config file: `.vscode/mcp.json`

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

#### Cline

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

#### Continue.dev

Config file: `~/.continue/config.yaml`

```yaml
mcpServers:
  - name: test-intel
    command: npx
    args:
      - -y
      - "@barissozudogru/test-intel-mcp"
```

#### Zed

Config file: `~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "test-intel": {
      "command": {
        "path": "npx",
        "args": ["-y", "@barissozudogru/test-intel-mcp"]
      }
    }
  }
}
```

#### JetBrains (IntelliJ, WebStorm, etc.)

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

---

### Option B: HTTP (remote clients)

Start the server:

```bash
npx @barissozudogru/test-intel-mcp --http
# or
PORT=3000 TRANSPORT=http npx @barissozudogru/test-intel-mcp
```

The server listens on `http://0.0.0.0:3000/mcp`. A health check is available at `/health`.

#### Cursor (HTTP)

```json
{
  "mcpServers": {
    "test-intel": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### VS Code + Copilot (HTTP)

```json
{
  "servers": {
    "test-intel": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### Windsurf (HTTP)

```json
{
  "mcpServers": {
    "test-intel": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

#### Continue.dev (HTTP)

```yaml
mcpServers:
  - name: test-intel
    url: http://localhost:3000/mcp
```

---

### Option C: Docker

```bash
docker build -t test-intel-mcp .
docker run -p 3000:3000 -v $(pwd):/project -w /project test-intel-mcp
```

Then configure any HTTP client to point at `http://localhost:3000/mcp`.

---

## Supported Coverage Formats

| Format | Extension | Generator |
|---|---|---|
| lcov | `.info` | Jest, Vitest, nyc, Istanbul |
| istanbul | `.json` | Jest, nyc, Istanbul |
| cobertura | `.xml` | Jest, pytest-cov, JaCoCo |

Format is auto-detected from file extension when `format` is omitted.

---

## Requirements

- Node.js >= 18
- No authentication or network access required
- All file analysis runs locally

---

## License

MIT
