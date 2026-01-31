# Opheys CLI

A command-line interface for common tasks related to Opheys IT-Consulting projects.

## Features

- **Update Command**: Streamlined dependency updates for pnpm projects
  - Updates pnpm to the latest version via corepack
  - Updates all project dependencies
  - Updates Biome formatter/linter to the latest version
  - Migrates Biome configuration automatically

## Prerequisites

- Node.js 18+ 
- pnpm package manager

## Installation

### Local Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd opheys-cli
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the project:
```bash
pnpm run build
```

### Global Installation

To use the CLI from anywhere on your system, you need to link it globally.

#### First-time Setup (Windows)

If you haven't used pnpm global packages before, run:
```bash
pnpm setup
```

**Important:** After running `pnpm setup`, you must **close and reopen your terminal** for the PATH changes to take effect.

#### Link the CLI Globally

After reopening your terminal, navigate to the project directory and run:

```bash
cd X:\repos\opheys-cli
pnpm link --global
```

This creates a symlink to your local development version, so any changes you make will be immediately available after rebuilding.

#### Verify Installation

Test that the CLI is working:
```bash
opheys --help
```

You should see the available commands and options.

## Usage

### Update Command

Update all dependencies in a pnpm project:

```bash
opheys update
```

This command will:
1. ✅ Update pnpm to the latest version
2. ✅ Update all project dependencies
3. ✅ Update Biome to the latest version
4. ✅ Migrate Biome configuration if needed

Simply run this command from the root of any pnpm project.

## Development

### Available Scripts

- `pnpm run build` - Compile TypeScript and resolve path aliases
- `pnpm run start` - Run the compiled CLI locally
- `pnpm run check` - Type check and lint the code
- `pnpm run check:fix` - Auto-fix linting issues

### Making Changes

1. Make your changes in the `src/` directory
2. Rebuild the project:
   ```bash
   pnpm run build
   ```
3. Test your changes:
   ```bash
   opheys <command>
   ```

Since the CLI is linked globally, your changes are immediately available after rebuilding.

### Adding New Commands

1. Create a new file in `src/commands/` (e.g., `my-command.ts`)
2. Export a `loadCommands` function that registers your command:
   ```typescript
   import type { Command } from 'commander'
   
   export function loadCommands(program: Command) {
     program
       .command('my-command')
       .description('Description of my command')
       .action(async () => {
         // Your command logic here
       })
   }
   ```
3. Import and call your `loadCommands` function in `src/index.ts`
4. Rebuild the project

## Uninstalling

To remove the global CLI:

```bash
pnpm unlink --global opheys-cli
```

Or if you used `pnpm install --global`:

```bash
pnpm uninstall --global opheys-cli
```

## Troubleshooting

### Command not found after linking

- Make sure you ran `pnpm setup` and **reopened your terminal**
- Verify that `%PNPM_HOME%` is in your PATH environment variable
- Try running `pnpm link --global` again

### Path alias errors during build

If you see `Cannot find module '@/...'` errors at runtime:
- Ensure `tsc-alias` is installed: `pnpm add -D tsc-alias`
- Verify the build script includes both `tsc` and `tsc-alias`: `"build": "tsc && tsc-alias"`
- Rebuild the project: `pnpm run build`

### Changes not reflected

- Make sure you rebuild after making changes: `pnpm run build`
- If using global install instead of link, you need to reinstall: `pnpm install --global .`

## License

ISC

## Author

Philipp Opheys
