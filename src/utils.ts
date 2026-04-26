import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spinner } from '@clack/prompts'

const USE_SHELL = process.platform === 'win32'

function runCmd(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      shell: USE_SHELL,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += String(chunk)
    })

    child.on('error', reject)

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(
          new Error(
            `Command failed: exit ${code}${stderr ? `\n${stderr}` : ''}`
          )
        )
      }
    })
  })
}

export function isGitRepo(): boolean {
  return existsSync(resolve(process.cwd(), '.git'))
}

export async function isBranchUpToDate(): Promise<{
  upToDate: boolean
  reason: string
}> {
  try {
    await runCmd('git', ['fetch'])

    const { stdout: status } = await runCmd('git', ['status', '-uno'])
    const statusText = status.trim()

    if (statusText.includes('Your branch is behind')) {
      return {
        upToDate: false,
        reason:
          'Your branch is behind the remote. Pull the latest changes first.',
      }
    }

    if (statusText.includes('have diverged')) {
      return {
        upToDate: false,
        reason:
          'Your branch has diverged from the remote. Resolve this before updating.',
      }
    }

    return { upToDate: true, reason: '' }
  } catch {
    return {
      upToDate: false,
      reason: 'Failed to determine git branch status.',
    }
  }
}

/**
 * Run a command and display a spinner. `cmd` and `args` are always kept
 * separate — shell metacharacters in arguments cannot be injected as
 * additional commands on Unix, and are unlikely to cause issues on Windows
 * given the restricted set of values this CLI ever passes.
 */
export async function execAsync(
  cmd: string,
  args: string[],
  startMessage: string,
  errorMessage: string,
  successMessage: string
): Promise<boolean> {
  const s = spinner()
  s.start(startMessage)
  try {
    await runCmd(cmd, args)
    s.stop(successMessage)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
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
  try {
    const content = readFileSync(packageJsonPath, 'utf-8')
    return JSON.parse(content) as PackageJson
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read package.json: ${message}`)
  }
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
    const pkg = JSON.parse(content) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

/**
 * Fetch all published versions of a package from the npm registry.
 * npm is used because it ships with every Node.js installation and both
 * pnpm and bun use the same registry under the hood.
 * Returns null on any error so callers degrade gracefully.
 */
async function fetchPublishedVersions(
  packageName: string
): Promise<string[] | null> {
  try {
    const { stdout } = await runCmd('npm', [
      'view',
      packageName,
      'versions',
      '--json',
    ])
    const parsed: unknown = JSON.parse(stdout)
    // npm returns a plain string when only one version has been published
    if (Array.isArray(parsed)) return parsed as string[]
    if (typeof parsed === 'string') return [parsed]
    return null
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

  const versions = await fetchPublishedVersions(packageName)
  if (!versions) return null

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

  if (candidates.length === 0) return null
  return candidates[candidates.length - 1]
}

export async function getNextPatchVersion(
  packageName: string,
  currentVersion: string
): Promise<string | null> {
  const { major, minor, patch } = parseVersion(currentVersion)

  const versions = await fetchPublishedVersions(packageName)
  if (!versions) return null

  const candidates = versions
    .filter((v) => {
      const parsed = parseVersion(v)
      return (
        parsed.major === major &&
        parsed.minor === minor &&
        parsed.patch > patch &&
        !v.includes('-')
      )
    })
    .sort((a, b) => {
      const pa = parseVersion(a)
      const pb = parseVersion(b)
      return pa.patch - pb.patch
    })

  if (candidates.length === 0) return null
  return candidates[candidates.length - 1]
}
