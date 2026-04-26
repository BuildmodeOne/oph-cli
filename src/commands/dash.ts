import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { intro, log, outro, spinner } from '@clack/prompts'
import type { Command } from 'commander'
import ignore, { type Ignore } from 'ignore'
import color from 'picocolors'

// Em dash — (U+2014) and en dash – (U+2013)

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.ico',
  '.svg',
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.flac',
  '.avi',
  '.mov',
  '.mkv',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.rar',
  '.7z',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.lock',
])

function isBinaryPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return true

  // Filenames without extension that are known binaries / non-text
  const base = basename(filePath).toLowerCase()
  const knownBinaryFiles = new Set([
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
  ])
  if (knownBinaryFiles.has(base)) return false // still text, just skip for safety? No - these are text, keep them

  return false
}

function hasBinaryContent(buffer: Buffer): boolean {
  // Scan the first 8 KB for null bytes - a strong indicator of binary content
  const sampleSize = Math.min(buffer.length, 8192)
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

function buildIgnore(cwd: string): Ignore {
  const ig = ignore()

  // Always ignore .git itself
  ig.add('.git')

  const gitignorePath = resolve(cwd, '.gitignore')
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    ig.add(content)
  }

  return ig
}

function walkFiles(
  dir: string,
  cwd: string,
  ig: Ignore,
  files: string[] = [],
  depth = 0,
  maxDepth = 50
): string[] {
  if (depth > maxDepth) return files
  let entries: import('node:fs').Dirent[]

  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(cwd, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      // Check directory with and without trailing slash
      if (ig.ignores(relPath) || ig.ignores(`${relPath}/`)) continue
      walkFiles(fullPath, cwd, ig, files, depth + 1, maxDepth)
    } else if (entry.isFile()) {
      if (ig.ignores(relPath)) continue
      files.push(fullPath)
    }
  }

  return files
}

export function loadDashCommand(program: Command) {
  program
    .command('dash')
    .description(
      'Replace AI em dashes (— –) with a regular minus (-) in all non-ignored files'
    )
    .option('--dry-run', 'Preview changes without writing to disk', false)
    .action(async (options: { dryRun: boolean }) => {
      console.log()
      intro(color.inverse(' Opheys CLI - Dash Replacer '))

      const cwd = process.cwd()
      const ig = buildIgnore(cwd)

      const gitignorePath = resolve(cwd, '.gitignore')
      if (existsSync(gitignorePath)) {
        log.info(
          color.dim(`Using .gitignore from ${color.bold(gitignorePath)}`)
        )
      } else {
        log.warn(color.yellow('No .gitignore found - scanning all files'))
      }

      if (options.dryRun) {
        log.warn(color.yellow('Dry-run mode: no files will be modified'))
      }

      const s = spinner()
      s.start('Scanning files…')

      const allFiles = walkFiles(cwd, cwd, ig)

      s.stop(`Found ${color.bold(String(allFiles.length))} file(s) to inspect`)

      let scanned = 0
      let changed = 0
      let skipped = 0
      const changedFiles: string[] = []

      for (const filePath of allFiles) {
        scanned++

        if (isBinaryPath(filePath)) {
          skipped++
          continue
        }

        let buffer: Buffer
        try {
          buffer = readFileSync(filePath)
        } catch {
          skipped++
          continue
        }

        if (hasBinaryContent(buffer)) {
          skipped++
          continue
        }

        const original = buffer.toString('utf-8')

        if (!/[—–]/.test(original)) continue

        const replaced = original.replace(/[—–]/g, '-')
        const relPath = relative(cwd, filePath).replace(/\\/g, '/')

        if (!options.dryRun) {
          try {
            writeFileSync(filePath, replaced, 'utf-8')
          } catch {
            log.warn(color.yellow(`Could not write: ${relPath}`))
            continue
          }
        }

        changed++
        changedFiles.push(relPath)
        log.success(
          `${options.dryRun ? color.dim('[dry-run] ') : ''}${color.green(relPath)}`
        )
      }

      console.log()
      log.info(
        [
          `Scanned : ${color.bold(String(scanned))} file(s)`,
          `Modified: ${color.bold(color.green(String(changed)))} file(s)`,
          `Skipped : ${color.dim(String(skipped))} binary/unreadable file(s)`,
        ].join('\n          ')
      )

      if (changed === 0) {
        outro(color.dim('No em dashes found - nothing to do.'))
      } else if (options.dryRun) {
        outro(
          color.yellow(
            `Dry-run complete. ${changed} file(s) would have been modified.`
          )
        )
      } else {
        outro(color.green(`Done! Replaced em dashes in ${changed} file(s).`))
      }
    })
}
