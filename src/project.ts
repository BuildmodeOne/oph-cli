import { existsSync, globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { readWorkspacePackageGlobs } from '@/pnpm-workspace'
import { findUp, type PackageJson, readProjectPackageJson } from '@/utils'

export type PackageManager = 'bun' | 'pnpm'

export interface WorkspacePackage {
  dir: string
  name: string
  pkg: PackageJson
  isRoot: boolean
}

export interface Project {
  pm: PackageManager
  root: string
  isMonorepo: boolean
  /** Root first, followed by workspace packages (monorepo only). */
  packages: WorkspacePackage[]
}

const BUN_LOCKFILES = ['bun.lock', 'bun.lockb']
const PNPM_LOCKFILE = 'pnpm-lock.yaml'

function detectPackageManager(root: string): PackageManager {
  return BUN_LOCKFILES.some((f) => existsSync(resolve(root, f)))
    ? 'bun'
    : 'pnpm'
}

function readBunWorkspaceGlobs(pkg: PackageJson): string[] {
  const ws = pkg.workspaces
  if (Array.isArray(ws)) return ws
  return ws?.packages ?? []
}

function expandPackageDirs(root: string, globs: string[]): string[] {
  const toManifests = (patterns: string[]) =>
    patterns.length === 0
      ? []
      : globSync(
          patterns.map((g) => `${g.replace(/\/+$/, '')}/package.json`),
          { cwd: root, exclude: (p) => /(^|[\\/])node_modules$/.test(p) }
        )

  const include = globs.filter((g) => !g.startsWith('!'))
  const exclude = new Set(
    toManifests(globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1)))
  )

  const dirs = toManifests(include)
    .filter((p) => !exclude.has(p))
    .map((p) => resolve(root, dirname(p)))

  return [...new Set(dirs)].filter((d) => d !== root).sort()
}

function toWorkspacePackage(dir: string, isRoot: boolean): WorkspacePackage {
  const pkg = readProjectPackageJson(dir)
  return { dir, name: pkg.name ?? dir, pkg, isRoot }
}

export function resolveProject(start: string = process.cwd()): Project {
  const root = findUp(start, [...BUN_LOCKFILES, PNPM_LOCKFILE])
  if (!root) {
    throw new Error(
      'Could not detect a supported package manager. ' +
        'Expected a pnpm-lock.yaml (pnpm) or bun.lock / bun.lockb (bun) in this directory or any parent.'
    )
  }

  const pm = detectPackageManager(root)
  const rootPackage = toWorkspacePackage(root, true)
  const globs =
    pm === 'pnpm'
      ? readWorkspacePackageGlobs(root)
      : readBunWorkspaceGlobs(rootPackage.pkg)

  const members = expandPackageDirs(root, globs).map((dir) =>
    toWorkspacePackage(dir, false)
  )

  return {
    pm,
    root,
    isMonorepo: globs.length > 0,
    packages: [rootPackage, ...members],
  }
}
