import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { intro, outro } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import { execAsync } from '@/utils'

type PackageManager = 'bun' | 'pnpm'

function detectPackageManager(): PackageManager {
  const cwd = process.cwd()

  if (
    existsSync(resolve(cwd, 'bun.lock')) ||
    existsSync(resolve(cwd, 'bun.lockb'))
  ) {
    return 'bun'
  }

  if (
    existsSync(resolve(cwd, 'package.json')) ||
    existsSync(resolve(cwd, 'pnpm-lock.yaml'))
  ) {
    return 'pnpm'
  }

  throw new Error('Unsupported package manager')
}

export function loadCommands(program: Command) {
  program
    .command('update')
    .description('Update project dependencies')
    .action(async () => {
      console.log()

      const pm = detectPackageManager()

      intro(color.inverse(` Opheys CLI - Update Project Dependencies (${pm}) `))

      if (pm === 'pnpm') {
        // use latest corepack
        await execAsync(
          'corepack use pnpm@latest',
          'Updating pnpm',
          'Failed to update pnpm',
          'Updated pnpm successfully'
        )
      }

      await execAsync(
        `${pm} update`,
        'Updating dependencies',
        'Failed to update dependencies',
        'Updated dependencies successfully'
      )

      const addExactFlag =
        pm === 'bun' ? '--dev --exact' : '--save-dev --save-exact'

      await execAsync(
        `${pm} add ${addExactFlag} @biomejs/biome@latest`,
        'Updating Biome',
        'Failed to update Biome',
        'Updated Biome successfully'
      )

      const execPrefix = pm === 'bun' ? 'bunx' : 'pnpm exec'

      await execAsync(
        `${execPrefix} biome migrate --write`,
        'Updating Biome configuration',
        'Failed to update Biome configuration',
        'Updated Biome configuration successfully'
      )

      outro(color.green('Project dependencies updated successfully!'))
    })
}
