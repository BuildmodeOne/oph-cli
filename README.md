# oph

CLI for common tasks for my projects.

## Installation

**macOS / Linux**
```sh
curl -fsSL https://raw.githubusercontent.com/BuildmodeOne/oph-cli/master/scripts/install.sh | bash
```

**Windows (PowerShell)**
```powershell
powershell -c "irm https://raw.githubusercontent.com/BuildmodeOne/oph-cli/master/scripts/install.ps1 | iex"
```

Both scripts download the correct binary, place it in `~/.oph/bin`, and add it to your `PATH`.

Or download manually from the [latest release](https://github.com/BuildmodeOne/oph-cli/releases/latest):

| Platform | Binary |
|---|---|
| Linux x64 | `oph-linux-x64` |
| Linux arm64 | `oph-linux-arm64` |
| macOS arm64 | `oph-darwin-arm64` |
| Windows x64 | `oph-win32-x64.exe` |


## Commands

| Command | Description |
|---|---|
| `oph update` | Update project dependencies (pnpm/bun), Biome, Tailwind, and run audit |
| `oph upgrade` | Replace the CLI binary with the latest release |
| `oph dash` | Replace AI em/en dashes with `-` across all non-ignored files |

```
oph --help
oph <command> --help
```

## License

ISC

