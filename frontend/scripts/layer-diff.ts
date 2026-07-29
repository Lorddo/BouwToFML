#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  formatLayerDebugMarkdown,
  formatRunComparisonMarkdown,
  loadLayerDebugReport,
} from '../src/platform/export/layer-debug/index.ts'

function usage(): void {
  console.log(`Usage: layer-diff <report.json|legacy.html> [options]

Options:
  --markdown-out <file>   Schrijf markdown-samenvatting naar bestand
  --compare <file>        Vergelijk met tweede rapport (run diff)
  --json-out <file>       Schrijf genormaliseerde layer-debug.json
  --stdout-markdown       Print markdown naar stdout (default)`)
}

function parseArgs(argv: string[]): {
  input?: string
  markdownOut?: string
  jsonOut?: string
  compare?: string
  stdoutMarkdown: boolean
} {
  const result = { stdoutMarkdown: true }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    if (arg === '--markdown-out') {
      result.markdownOut = argv[++i]
      continue
    }
    if (arg === '--json-out') {
      result.jsonOut = argv[++i]
      continue
    }
    if (arg === '--compare') {
      result.compare = argv[++i]
      continue
    }
    if (arg === '--stdout-markdown') {
      result.stdoutMarkdown = true
      continue
    }
    if (!arg.startsWith('-') && !result.input) {
      result.input = arg
    }
  }
  return result
}

function main(): void {
  const args = parseArgs(process.argv)
  if (!args.input) {
    usage()
    process.exit(1)
  }

  const inputPath = path.resolve(args.input)
  const raw = fs.readFileSync(inputPath, 'utf8')
  const report = loadLayerDebugReport(raw)

  if (args.jsonOut) {
    fs.writeFileSync(path.resolve(args.jsonOut), JSON.stringify(report, null, 2), 'utf8')
    console.error(`JSON geschreven: ${args.jsonOut}`)
  }

  let markdown = formatLayerDebugMarkdown(report)

  if (args.compare) {
    const compareRaw = fs.readFileSync(path.resolve(args.compare), 'utf8')
    const baseline = loadLayerDebugReport(compareRaw)
    markdown += '\n\n---\n\n' + formatRunComparisonMarkdown(baseline, report)
  }

  if (args.markdownOut) {
    fs.writeFileSync(path.resolve(args.markdownOut), markdown, 'utf8')
    console.error(`Markdown geschreven: ${args.markdownOut}`)
  }

  if (args.stdoutMarkdown) {
    process.stdout.write(markdown)
  }
}

main()
