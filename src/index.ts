#!/usr/bin/env node
import { Command } from 'commander'
import { loadDashCommand } from '@/commands/dash'
import { loadCommands } from '@/commands/update'
import { loadUpgradeCommand } from '@/commands/upgrade'
import { VERSION } from '@/version'

const program = new Command()
program
  .name('opheys-cli')
  .description(
    'A CLI for common tasks related to Opheys IT-Consulting projects'
  )
  .version(VERSION)

loadCommands(program)
loadUpgradeCommand(program)
loadDashCommand(program)

program.parse(process.argv)
