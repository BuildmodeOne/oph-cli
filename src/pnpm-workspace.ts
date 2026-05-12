import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WORKSPACE_FILE = 'pnpm-workspace.yaml'

const LEGACY_LIST_KEYS = [
  'onlyBuiltDependencies',
  'neverBuiltDependencies',
  'ignoredBuiltDependencies',
] as const

const LEGACY_FILE_KEY = 'onlyBuiltDependenciesFile'

type ParsedYaml = {
  lines: string[]
  lists: Record<string, { startLine: number; endLine: number; items: string[] }>
  fileRef: { line: number; value: string } | null
  hasAllowBuilds: boolean
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

function parseWorkspace(content: string): ParsedYaml {
  const lines = content.split(/\r?\n/)
  const lists: ParsedYaml['lists'] = {}
  let fileRef: ParsedYaml['fileRef'] = null
  let hasAllowBuilds = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const topMatch = line.match(/^([A-Za-z_][\w-]*)\s*:(.*)$/)
    if (!topMatch) continue

    const key = topMatch[1]
    const rest = topMatch[2].trim()

    if (key === 'allowBuilds') {
      hasAllowBuilds = true
      continue
    }

    if (key === LEGACY_FILE_KEY && rest.length > 0) {
      fileRef = { line: i, value: stripQuotes(rest) }
      continue
    }

    if ((LEGACY_LIST_KEYS as readonly string[]).includes(key) && rest === '') {
      const items: string[] = []
      let j = i + 1
      for (; j < lines.length; j++) {
        const itemMatch = lines[j].match(/^\s+-\s+(.+?)\s*$/)
        if (!itemMatch) {
          // allow blank lines inside? stop on any non-list line
          if (lines[j].trim() === '') continue
          break
        }
        items.push(stripQuotes(itemMatch[1]))
      }
      lists[key] = { startLine: i, endLine: j - 1, items }
      i = j - 1
    }
  }

  return { lines, lists, fileRef, hasAllowBuilds }
}

function loadFileRefEntries(cwd: string, path: string): string[] {
  const abs = resolve(cwd, path)
  if (!existsSync(abs)) return []
  try {
    const raw = readFileSync(abs, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string')
    }
    return []
  } catch {
    return []
  }
}

/**
 * Returns true when migration ran and rewrote the workspace file.
 */
export function migrateWorkspaceForPnpmV11(cwd: string = process.cwd()): {
  migrated: boolean
  reason: string
} {
  const wsPath = resolve(cwd, WORKSPACE_FILE)
  if (!existsSync(wsPath)) {
    return { migrated: false, reason: 'no pnpm-workspace.yaml' }
  }

  const original = readFileSync(wsPath, 'utf-8')
  const parsed = parseWorkspace(original)

  const hasLegacy =
    Object.keys(parsed.lists).length > 0 || parsed.fileRef !== null
  if (!hasLegacy) {
    return { migrated: false, reason: 'no legacy keys found' }
  }

  const allowBuilds: Record<string, boolean> = {}

  for (const name of parsed.lists.onlyBuiltDependencies?.items ?? []) {
    allowBuilds[name] = true
  }
  if (parsed.fileRef) {
    for (const name of loadFileRefEntries(cwd, parsed.fileRef.value)) {
      allowBuilds[name] = true
    }
  }
  for (const name of parsed.lists.neverBuiltDependencies?.items ?? []) {
    allowBuilds[name] = false
  }
  for (const name of parsed.lists.ignoredBuiltDependencies?.items ?? []) {
    allowBuilds[name] = false
  }

  const removeLines = new Set<number>()
  for (const key of LEGACY_LIST_KEYS) {
    const entry = parsed.lists[key]
    if (!entry) continue
    for (let k = entry.startLine; k <= entry.endLine; k++) removeLines.add(k)
  }
  if (parsed.fileRef) removeLines.add(parsed.fileRef.line)

  const kept = parsed.lines.filter((_, idx) => !removeLines.has(idx))

  // strip trailing blank lines, then re-add one separator before allowBuilds
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()

  const allowBuildsBlock: string[] = []
  if (!parsed.hasAllowBuilds) {
    allowBuildsBlock.push('allowBuilds:')
    for (const [name, value] of Object.entries(allowBuilds)) {
      allowBuildsBlock.push(`  ${name}: ${value}`)
    }
  }

  const out = [...kept, ...allowBuildsBlock, ''].join('\n')
  writeFileSync(wsPath, out, 'utf-8')

  return { migrated: true, reason: 'migrated' }
}
