# Context-Compacting Coding Agent

A coding agent that automatically compacts conversation history when approaching context limits.

## Setup

```bash
bun install
bun run index.ts
```

Requires Docker to be running.

## Usage

- **Start new session** (default):
  ```bash
  npm run start
  ```


- **Run demo**:
  ```bash
  npm run start demo
  ```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for the LLM

## Notes

- Sessions persist to SQLite - use `--resume` flag to resume the most recent session
- If Docker container crashes, the agent will attempt to recreate it
- Long-running tasks may trigger multiple compaction cycles - this is expected
- First run creates the database automatically
