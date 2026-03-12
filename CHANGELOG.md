# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-12

### Added

- `analyze_test_coverage` - Parse lcov, istanbul JSON, and cobertura XML coverage reports to surface uncovered files, functions, lines, and branches
- `find_untested_functions` - Scan source directories and identify functions with no corresponding test file
- `get_function_complexity` - Compute cyclomatic complexity per function to prioritize test writing
- `suggest_test_cases` - Analyze a function's logic and generate structured, categorized test case suggestions
