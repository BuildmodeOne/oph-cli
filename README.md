# Opheys CLI

A command-line interface for common tasks related to Opheys IT-Consulting projects.

## Features

- **`update`** — Streamlined dependency updates for pnpm/bun projects: updates the package manager, all deps, Biome, Tailwind, and runs an audit
- **`upgrade`** — Self-upgrades the CLI binary from the latest GitHub Release
- **`dash`** — Replaces AI em dashes (— –) with a regular minus (-) across all non-ignored files

## Installation

Download the binary for your platform from the [latest GitHub Release](https://github.com/BuildmodeOne/opheys-cli/releases/latest) and place it somewhere on your `PATH`.

| Platform | Asset |
|---|---|
| Linux x64 | `opheys-linux-x64` |
| Linux arm64 | `opheys-linux-arm64` |
| macOS arm64 | `opheys-darwin-arm64` |
| Windows x64 | `opheys-win32-x64.exe` |

No Node.js installation required — the binary is fully self-contained.

## Upgrading

```bash
opheys upgrade
```

Fetches the latest release from GitHub and replaces the running binary in-place.

## Usage

```bash
opheys update          # Update dependencies in the current project
opheys upgrade         # Upgrade the CLI itself
opheys dash            # Replace em/en dashes with minus
opheys dash --dry-run  # Preview dash replacements without writing
opheys --help
```

## Development

### Prerequisites

- Node.js 22+
- pnpm

### Setup

```bash
git clone https://github.com/BuildmodeOne/opheys-cli.git
cd opheys-cli
pnpm install
```

### Scripts

- `pnpm build` — Compile TypeScript
- `pnpm build:bin` — Build standalone binary → `bin/opheys`
- `pnpm check` — Type check + lint
- `pnpm check:fix` — Type check + lint + auto-fix

### Adding a command

1. Create `src/commands/my-command.ts` and export a `load*Command(program: Command)` function
2. Register it in `src/index.ts`
3. Rebuild with `pnpm build`

### Releasing

Bump `version` in `package.json`, then:

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

GitHub Actions builds all 4 platform binaries and attaches them to the release automatically.

## License

ISC

## Author

Philipp Opheys
