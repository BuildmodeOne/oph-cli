import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { intro, log, outro } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import {
  execAsync,
  getInstalledVersion,
  getNextMinorVersion,
  isDevDependency,
  isPackageInstalled,
  readProjectPackageJson,
} from '@/utils'

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

async function updateToNextMinor(
  pm: PackageManager,
  packageName: string,
  isDev: boolean
): Promise<void> {
  const currentVersion = await getInstalledVersion(packageName)

  if (!currentVersion) {
    log.warn(
      color.yellow(
        `Could not determine installed version of ${color.bold(packageName)}, skipping minor update`
      )
    )
    return
  }

  const nextMinor = await getNextMinorVersion(packageName, currentVersion)

  if (!nextMinor) {
    log.info(
      color.dim(
        `${color.bold(packageName)} v${currentVersion} — no newer minor version available`
      )
    )
    return
  }

  const devFlag = isDev ? (pm === 'bun' ? '--dev' : '--save-dev') : ''

  await execAsync(
    `${pm} add ${devFlag} ${packageName}@${nextMinor}`
      .replace(/\s+/g, ' ')
      .trim(),
    `Updating ${packageName} from v${currentVersion} to v${nextMinor}`,
    `Failed to update ${packageName} to v${nextMinor}`,
    `Updated ${packageName} from v${currentVersion} to v${nextMinor}`
  )
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

      // React / Next.js minor version updates
      const packageJson = readProjectPackageJson()
      const frameworkPackages = ['react', 'react-dom', 'next']
      const installedFrameworkPackages = frameworkPackages.filter((pkg) =>
        isPackageInstalled(packageJson, pkg)
      )

      if (installedFrameworkPackages.length > 0) {
        log.info(
          color.cyan(
            `Detected ${installedFrameworkPackages.map((p) => color.bold(p)).join(', ')} — checking for minor updates`
          )
        )

        for (const pkg of installedFrameworkPackages) {
          const isDev = isDevDependency(packageJson, pkg)
          await updateToNextMinor(pm, pkg, isDev)
        }
      }

      const addExactFlag =
        pm === 'bun' ? '--dev --exact' : '--save-dev --save-exact'

      const biomeVersionBefore = await getInstalledVersion('@biomejs/biome')

      await execAsync(
        `${pm} add ${addExactFlag} @biomejs/biome@latest`,
        'Updating Biome',
        'Failed to update Biome',
        'Updated Biome successfully'
      )

      const biomeVersionAfter = await getInstalledVersion('@biomejs/biome')
      const biomeWasUpdated =
        biomeVersionBefore !== null &&
        biomeVersionAfter !== null &&
        biomeVersionBefore !== biomeVersionAfter

      const execPrefix = pm === 'bun' ? 'bunx' : 'pnpm exec'

      await execAsync(
        `${execPrefix} biome migrate --write`,
        'Updating Biome configuration',
        'Failed to update Biome configuration',
        'Updated Biome configuration successfully'
      )

      if (biomeWasUpdated) {
        log.info(
          color.cyan(
            `Biome updated from v${biomeVersionBefore} to v${biomeVersionAfter} — applying new formatting rules`
          )
        )

        await execAsync(
          `${execPrefix} biome check --write .`,
          'Applying Biome formatting and lint fixes',
          'Failed to apply Biome formatting and lint fixes',
          'Applied Biome formatting and lint fixes successfully'
        )
      }

      outro(color.green('Project dependencies updated successfully!'))
    })
}
