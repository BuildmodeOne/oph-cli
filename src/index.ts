#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from 'commander'
import { loadDashCommand } from '@/commands/dash'
import { loadCommands } from '@/commands/update'
import { loadUpgradeCommand } from '@/commands/upgrade'

const program = new Command()
program
  .name('opheys-cli')
  .description(
    'A CLI for common tasks related to Opheys IT-Consulting projects'
  )
  .version(
    JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'))
      .version
  )

loadCommands(program)
loadUpgradeCommand(program)
loadDashCommand(program)

program.parse(process.argv)
