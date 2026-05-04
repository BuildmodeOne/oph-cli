# AGENTS

## Commands
```bash
pnpm check              # TS + Biome checks
pnpm check:fix          # Check + auto-fix
pnpm check:fix --unsafe # Check + auto-fix incl. unsafe (preferred)
pnpm build:bin          # Build standalone binary for current platform → bin/oph
```
Use head/tail to limit output tokens.

## Release
Bump `version` in `package.json`, then:
```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```
GitHub Actions builds all 4 platform binaries and attaches them to the release automatically.

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
