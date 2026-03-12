# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-03-12

### Fixed

- Template literal brace counting now correctly decrements depth on closing braces (was corrupting function body extraction)
- find_untested_functions no longer reports false "all files have tests" when files are outside the workspace
- Sandbox violations now return "Access denied" instead of misleading "File not found"

## [0.4.0] - 2026-03-12

### Changed

- Renamed from test-gap-mcp to test-intel-mcp for cohesive branding as part of the intel MCP suite

## [0.3.0] - 2026-03-12

### Added

- Streamable HTTP transport for remote MCP clients
- `--http` flag and `TRANSPORT=http` environment variable to select HTTP mode
- Health check endpoint at `/health` returning server name and version
- Dockerfile for containerized deployment
- smithery.yaml for Smithery registry
- Configuration examples for 10+ MCP clients (Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Cline, Continue, Zed, JetBrains, ChatGPT)

## [0.2.0] - 2026-03-12

### Fixed

- Brace counting now tracks string/comment/template-literal context (was corrupted by braces in strings)
- Cobertura parser computes actual function coverage (was hardcoded to 100%)
- Symlink loops in directory scanning no longer cause stack overflow
- Cyclomatic complexity: removed else/switch/forEach/map/filter/reduce overcounting, added ?? and ?. operators
- Arrow functions without braces no longer capture 500 lines of garbage
- Unified function detection patterns across all tools (was inconsistent)
- Block comments no longer produce phantom function detections
- LCOV records without end_of_record are no longer silently dropped
- LCOV duplicate file records are merged instead of overwritten
- Import detection uses precise path segment matching (was false-positive prone)
- Regex injection in suggest_test_cases function name escaping
- Error messages now include proper error details instead of bare String(err)

### Added

- Filesystem sandboxing: all paths validated against working directory (prevents path traversal)
- Max directory depth limit (50) prevents stack overflow on deep trees
- isError flag on all MCP error responses
- Dynamic version from package.json

## [0.1.0] - 2026-03-12

### Added

- `analyze_test_coverage` - Parse lcov, istanbul JSON, and cobertura XML coverage reports to surface uncovered files, functions, lines, and branches
- `find_untested_functions` - Scan source directories and identify functions with no corresponding test file
- `get_function_complexity` - Compute cyclomatic complexity per function to prioritize test writing
- `suggest_test_cases` - Analyze a function's logic and generate structured, categorized test case suggestions
