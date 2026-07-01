# Code Style

The authoritative code-style rules live in **`docs/conventions.md`** ("Code style" section) — the single source of truth, shared with the rest of the tooling. Read it before writing code.

Quick reminder (full rules in `docs/conventions.md`):

- ES6+ vanilla JS; small pure functions; readability > cleverness; no hidden side effects.
- PascalCase classes · camelCase vars/functions · SCREAMING_SNAKE_CASE constants.
- Private members via `#` (not `_`). Single quotes, semicolons, 4-space indent (no tabs).
- `async/await` over `.then`/`.catch`. Comments only when necessary, in English, concise.
