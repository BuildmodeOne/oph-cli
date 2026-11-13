import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { intro, log, outro, spinner } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import { migrateWorkspaceForPnpmV11 } from '@/pnpm-workspace'
import { type Project, resolveProject, type WorkspacePackage } from '@/project'
import {
  execAsync,
  getInstalledVersion,
  getLatestVersion,
  getMajor,
  getNextMinorVersion,
  getNextPatchVersion,
  getPnpmVersion,
  isBranchUpToDate,
  isDevDependency,
  isGitRepo,
  isPackageInstalled,
} from '@/utils'

const UNMANAGED_SPEC = /^(catalog|workspace):/

function inTarget(project: Project, target: WorkspacePackage): string {
  return project.isMonorepo ? ` in ${color.bold(target.name)}` : ''
}

// pnpm refuses to add to a workspace root without -w (ERR_PNPM_ADDING_TO_ROOT)
function rootFlag(project: Project, target: WorkspacePackage): string[] {
  return project.pm === 'pnpm' && project.isMonorepo && target.isRoot
    ? ['-w']
    : []
}

// bun hoists workspace deps to the root node_modules
async function getTargetVersion(
  project: Project,
  target: WorkspacePackage,
  packageName: string
): Promise<string | null> {
  return (
    (await getInstalledVersion(packageName, target.dir)) ??
    (target.isRoot ? null : getInstalledVersion(packageName, project.root))
  )
}

async function updateToNextMinor(
  project: Project,
  target: WorkspacePackage,
  packageName: string
): Promise<void> {
  const where = inTarget(project, target)
  const spec =
    target.pkg.dependencies?.[packageName] ??
    target.pkg.devDependencies?.[packageName]

  if (spec && UNMANAGED_SPEC.test(spec)) {
    log.info(
      color.dim(
        `${color.bold(packageName)}${where} uses "${spec}" - skipping minor update`
      )
    )
    return
  }

  const currentVersion = await getTargetVersion(project, target, packageName)

  if (!currentVersion) {
    log.warn(
      color.yellow(
        `Could not determine installed version of ${color.bold(packageName)}${where}, skipping minor update`
      )
    )
    return
  }

  const isDev = isDevDependency(target.pkg, packageName)
  const devFlag = isDev
    ? project.pm === 'bun'
      ? '--dev'
      : '--save-dev'
    : undefined
  const devArgs = devFlag ? [devFlag] : []
  const addArgs = ['add', ...rootFlag(project, target), ...devArgs]

  const nextVersion =
    (await getNextMinorVersion(packageName, currentVersion)) ??
    (await getNextPatchVersion(packageName, currentVersion))

  if (!nextVersion) {
    log.info(
      color.dim(
        `${color.bold(packageName)}${where} v${currentVersion} - already on the latest version`
      )
    )
    return
  }

  await execAsync(
    project.pm,
    [...addArgs, `${packageName}@^${nextVersion}`],
    `Updating ${packageName}${where} from v${currentVersion} to v${nextVersion}`,
    `Failed to update ${packageName}${where} to v${nextVersion}`,
    `Updated ${packageName}${where} from v${currentVersion} to v${nextVersion}`,
    { cwd: target.dir }
  )
}

export function loadCommands(program: Command) {
  program
    .command('update')
    .description('Update project dependencies')
    .option('-f, --force', 'Skip git branch check', false)
    .action(async (options: { force: boolean }) => {
      console.log()

      let project: Project
      try {
        project = resolveProject()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error(color.red(message))
        process.exit(1)
      }

      const { pm, root } = project
      const cwd = { cwd: root }

      intro(color.inverse(` oph - Update Project Dependencies (${pm}) `))

      if (project.isMonorepo) {
        log.info(
          color.dim(
            `Workspace root: ${color.bold(root)} (${project.packages.length - 1} packages)`
          )
        )
      }

      if (isGitRepo(root)) {
        if (options.force) {
          log.warn(color.yellow('Git branch check skipped (--force)'))
        } else {
          const { upToDate, reason } = await isBranchUpToDate(root)

          if (!upToDate) {
            log.error(color.red(reason))
            log.info(color.dim('Use --force or -f to bypass this check'))
            outro(color.red('Update aborted'))
            process.exit(1)
          }

          log.success(color.green('Git branch is up to date'))
        }
      }

      let pnpmCrossedV11 = false

      if (pm === 'pnpm') {
        const currentPnpm = await getPnpmVersion(root)
        const latestPnpm = await getLatestVersion('pnpm')
        pnpmCrossedV11 =
          currentPnpm !== null &&
          latestPnpm !== null &&
          getMajor(currentPnpm) < 11 &&
          getMajor(latestPnpm) >= 11

        if (currentPnpm && latestPnpm) {
          log.info(
            color.dim(`pnpm: current v${currentPnpm}, latest v${latestPnpm}`)
          )
        } else {
          log.warn(
            color.yellow(
              `Could not determine pnpm versions (current=${currentPnpm ?? 'null'}, latest=${latestPnpm ?? 'null'}) - skipping v11 migration check`
            )
          )
        }

        if (pnpmCrossedV11) {
          log.info(
            color.cyan(
              `pnpm v${currentPnpm} → v${latestPnpm} - migrating pnpm-workspace.yaml to allowBuilds`
            )
          )
          try {
            const { migrated, reason } = migrateWorkspaceForPnpmV11(root)
            if (migrated) {
              log.success(
                color.green('Migrated pnpm-workspace.yaml to allowBuilds')
              )
            } else {
              log.info(color.dim(`pnpm-workspace.yaml: ${reason}`))
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            log.error(
              color.red(`Failed to migrate pnpm-workspace.yaml: ${message}`)
            )
            outro(color.red('Update aborted'))
            process.exit(1)
          }

          const nodeModulesPaths = project.packages
            .map((p) => resolve(p.dir, 'node_modules'))
            .filter((p) => existsSync(p))
          if (nodeModulesPaths.length > 0) {
            const s = spinner()
            s.start('Removing node_modules for pnpm v11 reinstall')
            try {
              for (const p of nodeModulesPaths) {
                rmSync(p, { recursive: true, force: true })
              }
              s.stop('Removed node_modules')
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              s.stop('Failed to remove node_modules')
              log.error(color.red(message))
              outro(color.red('Update aborted'))
              process.exit(1)
            }
          }
        }

        await execAsync(
          'corepack',
          ['use', 'pnpm@latest'],
          'Updating pnpm',
          'Failed to update pnpm',
          'Updated pnpm successfully',
          cwd
        )

        if (pnpmCrossedV11) {
          await execAsync(
            'pnpm',
            ['install'],
            'Reinstalling dependencies for pnpm v11',
            'Failed to reinstall dependencies',
            'Reinstalled dependencies successfully',
            cwd
          )
        }
      }

      const recursiveArgs = pm === 'pnpm' && project.isMonorepo ? ['-r'] : []

      await execAsync(
        pm,
        ['update', ...recursiveArgs],
        'Updating dependencies',
        'Failed to update dependencies',
        'Updated dependencies successfully',
        cwd
      )

      // React / Next.js minor version updates
      const frameworkPackages = ['react', 'react-dom', 'next']

      for (const target of project.packages) {
        const installed = frameworkPackages.filter((pkg) =>
          isPackageInstalled(target.pkg, pkg)
        )
        if (installed.length === 0) continue

        log.info(
          color.cyan(
            `Detected ${installed.map((p) => color.bold(p)).join(', ')}${inTarget(project, target)} - checking for minor updates`
          )
        )

        for (const pkg of installed) {
          await updateToNextMinor(project, target, pkg)
        }
      }

      // Tailwind CSS upgrade
      const execPrefix = pm === 'bun' ? 'bunx' : 'pnpx'

      for (const target of project.packages) {
        if (!isPackageInstalled(target.pkg, 'tailwindcss')) continue
        const where = inTarget(project, target)

        await execAsync(
          execPrefix,
          ['@tailwindcss/upgrade', '--force'],
          `Upgrading Tailwind CSS${where}`,
          `Failed to upgrade Tailwind CSS${where}`,
          `Upgraded Tailwind CSS${where} successfully`,
          { cwd: target.dir }
        )
      }

      // Biome: update wherever it is declared, otherwise install at the root
      const declaringBiome = project.packages.filter((p) =>
        isPackageInstalled(p.pkg, '@biomejs/biome')
      )
      const biomeTargets =
        declaringBiome.length > 0 ? declaringBiome : [project.packages[0]]

      const addExactArgs =
        pm === 'bun' ? ['--dev', '--exact'] : ['--save-dev', '--save-exact']
      const biomeCmd = pm === 'bun' ? 'bunx' : 'pnpm'
      const biomeBaseArgs = pm === 'bun' ? [] : ['exec']

      for (const target of biomeTargets) {
        const where = inTarget(project, target)
        const biomeVersionBefore = await getTargetVersion(
          project,
          target,
          '@biomejs/biome'
        )

        await execAsync(
          pm,
          [
            'add',
            ...rootFlag(project, target),
            ...addExactArgs,
            '@biomejs/biome@latest',
          ],
          `Updating Biome${where}`,
          `Failed to update Biome${where}`,
          `Updated Biome${where} successfully`,
          { cwd: target.dir }
        )

        const biomeVersionAfter = await getTargetVersion(
          project,
          target,
          '@biomejs/biome'
        )
        const biomeWasUpdated =
          biomeVersionBefore !== null &&
          biomeVersionAfter !== null &&
          biomeVersionBefore !== biomeVersionAfter

        await execAsync(
          biomeCmd,
          [...biomeBaseArgs, 'biome', 'migrate', '--write'],
          `Updating Biome configuration${where}`,
          `Failed to update Biome configuration${where}`,
          `Updated Biome configuration${where} successfully`,
          { cwd: target.dir }
        )

        if (biomeWasUpdated) {
          log.info(
            color.cyan(
              `Biome${where} updated from v${biomeVersionBefore} to v${biomeVersionAfter} - applying new formatting rules`
            )
          )

          await execAsync(
            biomeCmd,
            [...biomeBaseArgs, 'biome', 'check', '--write', '.'],
            `Applying Biome formatting and lint fixes${where}`,
            `Failed to apply Biome formatting and lint fixes${where}`,
            `Applied Biome formatting and lint fixes${where} successfully`,
            { cwd: target.dir }
          )
        }
      }

      const auditPassed = await execAsync(
        pm,
        ['audit'],
        'Auditing for known vulnerabilities',
        'Vulnerability audit found issues - review the report below',
        'Vulnerability audit passed',
        cwd
      )

      if (auditPassed) {
        outro(color.green('Project dependencies updated successfully!'))
      } else {
        outro(
          color.yellow(
            'Project dependencies updated - vulnerabilities need attention'
          )
        )
      }
    })
}
