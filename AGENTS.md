# AGENTS

## Commands
```bash
pnpm check              # TS + Biome checks
pnpm check:fix          # Check + auto-fix
pnpm check:fix --unsafe # Check + auto-fix incl. unsafe (preferred)
```
Use head/tail to limit output tokens.

## Rules

### Consistency
- Follow existing codebase patterns
- Reuse utility functions and components
- Use absolute imports via `@/` alias

### Type Safety
- Use proper TypeScript interfaces
- No `any` types unless unavoidable

### General
- `pnpm` only - never `npm` or `yarn`
- `pnpm dlx` or `pnpm exec` over `npx`
- `async/await` over `.then()`
- No AI-generated comments; only meaningful senior-dev comments (!)
- No unnecessary Markdown files unless requested
- Keep all output compact and token-efficient (applies to comments, explanations, and prose - not code logic itself)
