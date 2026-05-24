<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `yarn nx build`, `yarn exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Benchmarking

The project has a performance benchmark harness at `packages/ts/bench/` (`@lights/bench`).

- **Run:** `yarn nx run @lights/bench:bench`
- **Files:** `src/*.bench.ts` — vitest bench format
  - `frame-copy.bench.ts` — buffer accumulation patterns + frame copy cost
  - `graph-throughput.bench.ts` — RxJS DAG throughput (frames/sec)
  - `python-ipc.bench.ts` — Python subprocess round-trip + MediaPipe inference latency
- **Echo script:** `packages/py/echo/main.py` — minimal Python IPC echo for isolating serialization from inference
- Requires Python 3 on PATH; `python-ipc.bench.ts` additionally requires `pip install mediapipe numpy`
- Always run the bench before and after touching the frame pipeline hot path to verify no regression
