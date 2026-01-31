#!/usr/bin/env node
import { Command } from 'commander'
import { loadCommands } from '@/commands/update'

const program = new Command()
program
  .name('opheys-cli')
  .description(
    'A CLI for common tasks related to Opheys IT-Consulting projects'
  )
  .version('1.0.0')

loadCommands(program)

program.parse(process.argv)
