import { resolve } from 'node:path'
import { intro, log, outro } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import { execAsync } from '@/utils'

function getCliRepoDir(): string {
  // dist/index.js is the entry point; repo root is one level up
  return resolve(__dirname, '..', '..')
}

export function loadUpgradeCommand(program: Command) {
  program
    .command('upgrade')
    .description(
      'Self-upgrade the CLI by pulling the latest changes and rebuilding'
    )
    .action(async () => {
      console.log()
      intro(color.inverse(' Opheys CLI - Upgrade '))

      const repoDir = getCliRepoDir()
      log.info(color.dim(`Repo: ${repoDir}`))

      const pulled = await execAsync(
        'git',
        ['-C', repoDir, 'pull'],
        'Pulling latest changes…',
        'Failed to pull latest changes',
        'Pulled latest changes'
      )

      if (!pulled) {
        outro(color.red('Upgrade failed'))
        process.exit(1)
      }

      const installed = await execAsync(
        'pnpm',
        ['--dir', repoDir, 'install'],
        'Installing dependencies…',
        'Failed to install dependencies',
        'Installed dependencies'
      )

      if (!installed) {
        outro(color.red('Upgrade failed'))
        process.exit(1)
      }

      const built = await execAsync(
        'pnpm',
        ['--dir', repoDir, 'build'],
        'Building…',
        'Failed to build',
        'Build complete'
      )

      if (!built) {
        outro(color.red('Upgrade failed'))
        process.exit(1)
      }

      outro(color.green('CLI upgraded successfully!'))
    })
}
