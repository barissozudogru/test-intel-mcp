# Coverage evidence from p-limit 7.3.1

This case study runs `test-intel-report` against a coverage artifact generated
from the public MIT-licensed
[`sindresorhus/p-limit`](https://github.com/sindresorhus/p-limit) repository.
It uses the upstream tests and source without adding a fixture or changing the
project under analysis.

## Pinned source

- Repository: `sindresorhus/p-limit`
- Version: `7.3.1`
- Commit: [`df476048d023ff868cd45b35ee47f5fb0ca2b25a`](https://github.com/sindresorhus/p-limit/commit/df476048d023ff868cd45b35ee47f5fb0ca2b25a)
- License: MIT
- Measured: 2026-08-26
- Runtime: Node.js 25.2.1
- Test runner: AVA 6.4.1
- Coverage producer: c8 12.0.0

## Reproduce the coverage

```sh
git clone https://github.com/sindresorhus/p-limit.git
cd p-limit
git checkout df476048d023ff868cd45b35ee47f5fb0ca2b25a
npm install
npx --yes c8 --clean --reporter=lcov --reporter=text ava
```

The upstream suite completed with 22 passing tests and produced 98.42% line
coverage, 97.05% branch coverage, and 100% function coverage.

## Analyze the artifact

From the `test-intel-mcp` repository:

```sh
npx -y -p @barissozudogru/test-intel-mcp \
  test-intel-report evidence/p-limit-7.3.1/lcov.info
```

Observed output:

```text
Coverage gaps found in 1 file(s):

File: index.js
  Line coverage:     98%
  Function coverage: 100%
  Branch coverage:   97%
  Uncovered lines: 13, 14
  Uncovered branches: line 12 block 3 branch 0
```

The checked-in lcov file contains counters and source locations, not source
code. Native coverage and the upstream repository remain the source of truth.
