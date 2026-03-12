# test-gap-mcp

MCP server that analyzes TypeScript and JavaScript projects to find test coverage gaps. Reads local files directly — no tokens, no external services, no authentication required.

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
    "test-gap": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-gap-mcp"]
    }
  }
}
```

#### Claude Code

```bash
claude mcp add test-gap -- npx -y @barissozudogru/test-gap-mcp
```

#### Cursor

Config file: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "test-gap": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-gap-mcp"]
    }
  }
}
```

#### Windsurf

Config file: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "test-gap": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-gap-mcp"]
    }
  }
}
```

#### VS Code + Copilot

Config file: `.vscode/mcp.json`

```json
{
  "servers": {
    "test-gap": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-gap-mcp"]
    }
  }
}
```

#### Cline

```json
{
  "mcpServers": {
    "test-gap": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-gap-mcp"]
    }
  }
}
```

#### Continue.dev

Config file: `~/.continue/config.yaml`

```yaml
mcpServers:
  - name: test-gap
    command: npx
    args:
      - -y
      - "@barissozudogru/test-gap-mcp"
```

#### Zed

Config file: `~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "test-gap": {
      "command": {
        "path": "npx",
        "args": ["-y", "@barissozudogru/test-gap-mcp"]
      }
    }
  }
}
```

#### JetBrains (IntelliJ, WebStorm, etc.)

```json
{
  "mcpServers": {
    "test-gap": {
      "command": "npx",
      "args": ["-y", "@barissozudogru/test-gap-mcp"]
    }
  }
}
```

---

### Option B: HTTP (remote clients)

Start the server:

```bash
npx @barissozudogru/test-gap-mcp --http
# or
PORT=3000 TRANSPORT=http npx @barissozudogru/test-gap-mcp
```

The server listens on `http://0.0.0.0:3000/mcp`. A health check is available at `/health`.

#### Cursor (HTTP)

```json
{
  "mcpServers": {
    "test-gap": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### VS Code + Copilot (HTTP)

```json
{
  "servers": {
    "test-gap": {
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
    "test-gap": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

#### Continue.dev (HTTP)

```yaml
mcpServers:
  - name: test-gap
    url: http://localhost:3000/mcp
```

---

### Option C: Docker

```bash
docker build -t test-gap-mcp .
docker run -p 3000:3000 -v $(pwd):/project -w /project test-gap-mcp
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
