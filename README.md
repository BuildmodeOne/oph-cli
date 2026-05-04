# opheys-cli

CLI for common tasks for my projects.

## Installation

Download the binary for your platform from the [latest release](https://github.com/BuildmodeOne/opheys-cli/releases/latest) and place it on your `PATH`.

| Platform | Binary |
|---|---|
| Linux x64 | `opheys-linux-x64` |
| Linux arm64 | `opheys-linux-arm64` |
| macOS arm64 | `opheys-darwin-arm64` |
| Windows x64 | `opheys-win32-x64.exe` |


## Commands

| Command | Description |
|---|---|
| `opheys update` | Update project dependencies (pnpm/bun), Biome, Tailwind, and run audit |
| `opheys upgrade` | Replace the CLI binary with the latest release |
| `opheys dash` | Replace AI em/en dashes with `-` across all non-ignored files |

```
opheys --help
opheys <command> --help
```

## License

ISC

