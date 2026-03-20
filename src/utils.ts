import { exec } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { spinner } from '@clack/prompts'

const execAsyncUtil = promisify(exec)

export async function execAsync(
  command: string,
  startMessage: string,
  errorMessage: string,
  successMessage: string
): Promise<boolean> {
  const s = spinner()
  s.start(startMessage)
  try {
    await execAsyncUtil(command)

    s.stop(successMessage)
    return true
  } catch (_error) {
    console.error(_error)
    s.stop(errorMessage)
    return false
  }
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function readProjectPackageJson(): PackageJson {
  const packageJsonPath = resolve(process.cwd(), 'package.json')
  const content = readFileSync(packageJsonPath, 'utf-8')
  return JSON.parse(content) as PackageJson
}

export function isPackageInstalled(
  packageJson: PackageJson,
  packageName: string
): boolean {
  return (
    packageName in (packageJson.dependencies ?? {}) ||
    packageName in (packageJson.devDependencies ?? {})
  )
}

export function isDevDependency(
  packageJson: PackageJson,
  packageName: string
): boolean {
  return packageName in (packageJson.devDependencies ?? {})
}

function parseVersion(version: string): {
  major: number
  minor: number
  patch: number
} {
  const cleaned = version.replace(/^[^0-9]*/, '')
  const [major, minor, patch] = cleaned.split('.').map(Number)
  return { major, minor, patch }
}

export async function getInstalledVersion(
  packageName: string
): Promise<string | null> {
  try {
    const packageJsonPath = resolve(
      process.cwd(),
      'node_modules',
      packageName,
      'package.json'
    )
    const content = readFileSync(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content) as { version: string }
    return pkg.version
  } catch {
    return null
  }
}

export async function getNextMinorVersion(
  packageName: string,
  currentVersion: string
): Promise<string | null> {
  const { major, minor } = parseVersion(currentVersion)
  const targetMinor = minor + 1

  try {
    const { stdout } = await execAsyncUtil(
      `npm view ${packageName} versions --json`
    )
    const versions = JSON.parse(stdout) as string[]

    const candidates = versions
      .filter((v) => {
        const parsed = parseVersion(v)
        return (
          parsed.major === major &&
          parsed.minor === targetMinor &&
          !v.includes('-')
        )
      })
      .sort((a, b) => {
        const pa = parseVersion(a)
        const pb = parseVersion(b)
        return pa.patch - pb.patch
      })

    if (candidates.length === 0) {
      return null
    }

    return candidates[candidates.length - 1]
  } catch {
    return null
  }
}
