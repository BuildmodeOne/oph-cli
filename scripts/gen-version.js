const { writeFileSync } = require('node:fs')
const { version } = require('../package.json')

writeFileSync('src/version.ts', `export const VERSION = '${version}'\n`)
