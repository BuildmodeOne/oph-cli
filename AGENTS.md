# AGENTS

## Commands
```bash
cargo fmt --check       # Format check
cargo clippy -- -D warnings
cargo test
cargo build --release   # Standalone binary → target/release/oph
```
Use head/tail to limit output tokens.

## Release
Bump `version` in `Cargo.toml`, then:
```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```
GitHub Actions builds all 4 platform binaries and attaches them to the release automatically.

## Rules

### Consistency
- Follow existing codebase patterns
- Reuse utility functions and modules

### General
- No AI-generated comments; only meaningful senior-dev comments (!)
- No unnecessary Markdown files unless requested
- Keep all output compact and token-efficient (applies to comments, explanations, and prose - not code logic itself)
