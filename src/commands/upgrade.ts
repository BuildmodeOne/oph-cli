import { spawn } from 'node:child_process'
import {
  chmodSync,
  createWriteStream,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { get } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { intro, log, outro, spinner } from '@clack/prompts'
import type { Command } from 'commander'
import color from 'picocolors'
import { VERSION } from '@/version'

const GH_REPO = 'BuildmodeOne/opheys-cli'

interface GhRelease {
  tag_name: string
  assets: { name: string; browser_download_url: string }[]
}

function getAssetName(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return `opheys-${process.platform}-${process.arch}${ext}`
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    get(
      url,
      {
        headers: {
          'User-Agent': 'opheys-cli',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        let body = ''
        res.on('data', (chunk: string) => {
          body += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T)
          } catch (e) {
            reject(e)
          }
        })
      }
    ).on('error', reject)
  })
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)

    function request(u: string): void {
      get(u, { headers: { 'User-Agent': 'opheys-cli' } }, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location
        ) {
          res.destroy()
          request(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          res.destroy()
          file.close()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', (err) => {
          file.close()
          reject(err)
        })
      }).on('error', (err) => {
        file.close()
        reject(err)
      })
    }

    request(url)
  })
}

export function loadUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Self-upgrade the CLI to the latest release from GitHub')
    .action(async () => {
      console.log()
      intro(color.inverse(' Opheys CLI - Upgrade '))

      const s = spinner()
      s.start('Checking latest release…')

      let release: GhRelease
      try {
        release = await fetchJson<GhRelease>(
          `https://api.github.com/repos/${GH_REPO}/releases/latest`
        )
      } catch {
        s.stop(color.red('Failed to fetch release info'))
        outro(color.red('Upgrade failed'))
        process.exit(1)
      }

      const latestVersion = release.tag_name.replace(/^v/, '')
      if (latestVersion === VERSION) {
        s.stop(`Already on latest version ${color.green(VERSION)}`)
        outro('Nothing to do')
        return
      }
      s.stop(
        `Latest: ${color.green(release.tag_name)}  Current: ${color.dim(VERSION)}`
      )

      const currentBinary = process.execPath
      if (/[/\\]node(\.exe)?$/.test(currentBinary)) {
        log.warn(
          'Not running as a prebuilt binary — upgrade only works with the installed binary'
        )
        outro(color.yellow('Skipped'))
        return
      }

      const assetName = getAssetName()
      const asset = release.assets.find((a) => a.name === assetName)
      if (!asset) {
        log.error(`No binary found for this platform (${assetName})`)
        outro(color.red('Upgrade failed'))
        process.exit(1)
      }

      const tempPath = join(tmpdir(), assetName)
      s.start(`Downloading ${assetName}…`)
      try {
        await download(asset.browser_download_url, tempPath)
      } catch {
        s.stop(color.red('Download failed'))
        outro(color.red('Upgrade failed'))
        process.exit(1)
      }
      s.stop('Downloaded')

      log.step(`Replacing ${color.dim(currentBinary)}…`)
      if (process.platform === 'win32') {
        const bat = join(tmpdir(), 'opheys-upgrade.bat')
        writeFileSync(
          bat,
          [
            '@echo off',
            'timeout /t 2 /nobreak >nul',
            `copy /y "${tempPath}" "${currentBinary}"`,
            `del "${tempPath}"`,
            'del "%~f0"',
          ].join('\r\n')
        )
        spawn('cmd.exe', ['/c', bat], {
          detached: true,
          stdio: 'ignore',
        }).unref()
      } else {
        chmodSync(tempPath, 0o755)
        renameSync(tempPath, currentBinary)
      }

      outro(color.green(`Upgraded to ${release.tag_name}`))
    })
}
