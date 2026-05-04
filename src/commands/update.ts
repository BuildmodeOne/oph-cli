import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { intro, log, outro } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import {
  execAsync,
  getInstalledVersion,
  getNextMinorVersion,
  getNextPatchVersion,
  isBranchUpToDate,
  isDevDependency,
  isGitRepo,
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

  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }

  throw new Error(
    'Could not detect a supported package manager. ' +
      'Expected a pnpm-lock.yaml (pnpm) or bun.lock / bun.lockb (bun) in the current directory.'
  )
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

  const devFlag = isDev ? (pm === 'bun' ? '--dev' : '--save-dev') : undefined
  const devArgs = devFlag ? [devFlag] : []

  const nextMinor = await getNextMinorVersion(packageName, currentVersion)

  if (!nextMinor) {
    const nextPatch = await getNextPatchVersion(packageName, currentVersion)

    if (!nextPatch) {
      log.info(
        color.dim(
          `${color.bold(packageName)} v${currentVersion} - already on the latest version`
        )
      )
      return
    }

    await execAsync(
      pm,
      ['add', ...devArgs, `${packageName}@^${nextPatch}`],
      `Updating ${packageName} from v${currentVersion} to v${nextPatch}`,
      `Failed to update ${packageName} to v${nextPatch}`,
      `Updated ${packageName} from v${currentVersion} to v${nextPatch}`
    )
    return
  }

  await execAsync(
    pm,
    ['add', ...devArgs, `${packageName}@^${nextMinor}`],
    `Updating ${packageName} from v${currentVersion} to v${nextMinor}`,
    `Failed to update ${packageName} to v${nextMinor}`,
    `Updated ${packageName} from v${currentVersion} to v${nextMinor}`
  )
}

export function loadCommands(program: Command) {
  program
    .command('update')
    .description('Update project dependencies')
    .option('-f, --force', 'Skip git branch check', false)
    .action(async (options: { force: boolean }) => {
      console.log()

      let pm: PackageManager
      try {
        pm = detectPackageManager()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error(color.red(message))
        process.exit(1)
      }

      intro(color.inverse(` oph - Update Project Dependencies (${pm}) `))

      if (isGitRepo()) {
        if (options.force) {
          log.warn(color.yellow('Git branch check skipped (--force)'))
        } else {
          const { upToDate, reason } = await isBranchUpToDate()

          if (!upToDate) {
            log.error(color.red(reason))
            log.info(color.dim('Use --force or -f to bypass this check'))
            outro(color.red('Update aborted'))
            process.exit(1)
          }

          log.success(color.green('Git branch is up to date'))
        }
      }

      if (pm === 'pnpm') {
        await execAsync(
          'corepack',
          ['use', 'pnpm@latest'],
          'Updating pnpm',
          'Failed to update pnpm',
          'Updated pnpm successfully'
        )
      }

      await execAsync(
        pm,
        ['update'],
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
            `Detected ${installedFrameworkPackages.map((p) => color.bold(p)).join(', ')} - checking for minor updates`
          )
        )

        for (const pkg of installedFrameworkPackages) {
          const isDev = isDevDependency(packageJson, pkg)
          await updateToNextMinor(pm, pkg, isDev)
        }
      }

      // Tailwind CSS upgrade
      if (isPackageInstalled(packageJson, 'tailwindcss')) {
        const execPrefix = pm === 'bun' ? 'bunx' : 'pnpx'

        await execAsync(
          execPrefix,
          ['@tailwindcss/upgrade', '--force'],
          'Upgrading Tailwind CSS',
          'Failed to upgrade Tailwind CSS',
          'Upgraded Tailwind CSS successfully'
        )
      }

      const addExactArgs =
        pm === 'bun' ? ['--dev', '--exact'] : ['--save-dev', '--save-exact']

      const biomeVersionBefore = await getInstalledVersion('@biomejs/biome')

      await execAsync(
        pm,
        ['add', ...addExactArgs, '@biomejs/biome@latest'],
        'Updating Biome',
        'Failed to update Biome',
        'Updated Biome successfully'
      )

      const biomeVersionAfter = await getInstalledVersion('@biomejs/biome')
      const biomeWasUpdated =
        biomeVersionBefore !== null &&
        biomeVersionAfter !== null &&
        biomeVersionBefore !== biomeVersionAfter

      const biomeCmd = pm === 'bun' ? 'bunx' : 'pnpm'
      const biomeBaseArgs = pm === 'bun' ? [] : ['exec']

      await execAsync(
        biomeCmd,
        [...biomeBaseArgs, 'biome', 'migrate', '--write'],
        'Updating Biome configuration',
        'Failed to update Biome configuration',
        'Updated Biome configuration successfully'
      )

      if (biomeWasUpdated) {
        log.info(
          color.cyan(
            `Biome updated from v${biomeVersionBefore} to v${biomeVersionAfter} - applying new formatting rules`
          )
        )

        await execAsync(
          biomeCmd,
          [...biomeBaseArgs, 'biome', 'check', '--write', '.'],
          'Applying Biome formatting and lint fixes',
          'Failed to apply Biome formatting and lint fixes',
          'Applied Biome formatting and lint fixes successfully'
        )
      }

      await execAsync(
        pm,
        ['audit'],
        'Auditing for known vulnerabilities',
        'Vulnerability audit found issues - review the output above',
        'Vulnerability audit passed'
      )

      outro(color.green('Project dependencies updated successfully!'))
    })
}
