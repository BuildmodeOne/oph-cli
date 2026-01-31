import { intro, outro } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import { execAsync } from '@/utils'

export function loadCommands(program: Command) {
  program
    .command('update')
    .description('Update a pnpm project dependencies')
    .action(async () => {
      console.log()

      intro(color.inverse(' Opheys CLI - Update Project Dependencies '))

      // use latest corepack
      await execAsync(
        'corepack use pnpm@latest',
        'Updating pnpm',
        'Failed to update pnpm',
        'Updated pnpm successfully'
      )

      await execAsync(
        'pnpm update',
        'Updating dependencies',
        'Failed to update dependencies',
        'Updated dependencies successfully'
      )

      await execAsync(
        'pnpm add --save-dev --save-exact @biomejs/biome@latest',
        'Updating Biome',
        'Failed to update Biome',
        'Updated Biome successfully'
      )

      await execAsync(
        'pnpm exec biome migrate --write',
        'Updating Biome configuration',
        'Failed to update Biome configuration',
        'Updated Biome configuration successfully'
      )

      outro(color.green('Project dependencies updated successfully!'))
    })
}
