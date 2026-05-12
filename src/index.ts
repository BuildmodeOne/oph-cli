#!/usr/bin/env node
import { Command } from 'commander'
import { loadDashCommand } from '@/commands/dash'
import { loadCommands } from '@/commands/update'
import { loadUpgradeCommand } from '@/commands/upgrade'
import { VERSION } from '@/version'

const program = new Command()
program
  .name('oph')
  .description('A general purpose CLI by Philipp Opheys')
  .version(VERSION)

loadCommands(program)
loadUpgradeCommand(program)
loadDashCommand(program)

program.parse(process.argv)
