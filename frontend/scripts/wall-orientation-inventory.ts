#!/usr/bin/env node
/**
 * Scan wall CV modules for orientation-asymmetric patterns (H/V/diagonal).
 * Output: JSON inventory for .cursor/docs/wall-orientation-audit.md
 *
 * Usage (from frontend/):
 *   node --experimental-strip-types scripts/wall-orientation-inventory.ts [--out <path>]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DEFAULT_OUT = path.resolve(
  ROOT,
  '..',
  '.cursor',
  'tests',
  'artifacts',
  'wall-orientation-inventory.json',
)

type FindingType = 'M' | 'D' | 'O' | 'A' | 'X' | 'T'

interface PatternRule {
  type: FindingType
  label: string
  regex: RegExp
}

const SCAN_DIRS = [
  'src/cv/walls',
  'src/cv/port/wallJunctionGraph.ts',
  'src/cv/port/wallSkeletonTrace.ts',
  'tests/cv/walls',
]

const PATTERNS: PatternRule[] = [
  { type: 'M', label: 'isFlatHorizontal', regex: /\bisFlatHorizontal\b/g },
  { type: 'M', label: 'isFlatVertical', regex: /\bisFlatVertical\b/g },
  { type: 'M', label: 'isCornerHorizontal', regex: /\bisCornerHorizontal\b/g },
  { type: 'M', label: 'isCornerVertical', regex: /\bisCornerVertical\b/g },
  { type: 'M', label: 'yOnWallAtX', regex: /\byOnWallAtX\b/g },
  { type: 'M', label: 'xOnWallAtY', regex: /\bxOnWallAtY\b/g },
  { type: 'D', label: 'isHorizontalAngle branch', regex: /\bisHorizontalAngle\s*\(/g },
  { type: 'D', label: 'isVerticalAngle branch', regex: /\bisVerticalAngle\s*\(/g },
  { type: 'O', label: 'Horizontal in export name', regex: /\b\w*Horizontal\w*\b/g },
  { type: 'O', label: 'Vertical in export name', regex: /\b\w*Vertical\w*\b/g },
  { type: 'A', label: 'segmentXRange', regex: /\bsegmentXRange\b/g },
  { type: 'A', label: 'segmentYRange', regex: /\bsegmentYRange\b/g },
  { type: 'A', label: 'centerlineHorizontal', regex: /\bcenterlineHorizontal\b/g },
  { type: 'A', label: 'pairIsHorizontal', regex: /\bpairIsHorizontal\b/g },
  { type: 'X', label: 'diagonal exclusion', regex: /!isFlatHorizontal[^;]*!isFlatVertical/g },
  { type: 'T', label: 'test filter delta-y', regex: /Math\.abs\(seg\.a\.y\s*-\s*seg\.b\.y\)/g },
  { type: 'T', label: 'test filter delta-x', regex: /Math\.abs\(seg\.a\.x\s*-\s*seg\.b\.x\)/g },
]

function collectFiles(): string[] {
  const files: string[] = []
  for (const rel of SCAN_DIRS) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const stat = fs.statSync(abs)
    if (stat.isFile()) {
      files.push(abs)
      continue
    }
    walk(abs, files)
  }
  return files.sort()
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'archive') continue
      walk(full, out)
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function countMatches(content: string, regex: RegExp): number {
  const re = new RegExp(regex.source, regex.flags)
  return [...content.matchAll(re)].length
}

function lineNumbers(content: string, regex: RegExp): number[] {
  const lines = content.split('\n')
  const nums: number[] = []
  const re = new RegExp(regex.source, regex.flags.replace('g', ''))
  lines.forEach((line, i) => {
    if (re.test(line)) nums.push(i + 1)
  })
  return nums
}

function parseArgs(): { outPath: string } {
  let outPath = DEFAULT_OUT
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--out' && process.argv[i + 1]) {
      outPath = path.resolve(process.argv[i + 1]!)
      i += 1
    }
  }
  return { outPath }
}

function main(): void {
  const { outPath } = parseArgs()
  const files = collectFiles()
  const generatedAt = new Date().toISOString().slice(0, 10)

  const fileReports = files
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8')
      const rel = path.relative(ROOT, filePath).replace(/\\/g, '/')
      const patterns = PATTERNS.map((rule) => {
        const count = countMatches(content, rule.regex)
        if (count === 0) return null
        return {
          type: rule.type,
          label: rule.label,
          count,
          lines: lineNumbers(content, rule.regex).slice(0, 20),
        }
      }).filter(Boolean)

      const hasHBranch = countMatches(content, /\bisHorizontalAngle\s*\(/g) > 0
      const hasVBranch = countMatches(content, /\bisVerticalAngle\s*\(/g) > 0
      const duplicateHV = hasHBranch && hasVBranch

      return {
        file: rel,
        patternHits: patterns,
        duplicateHVBranches: duplicateHV,
        totalHits: patterns.reduce((sum, p) => sum + (p?.count ?? 0), 0),
      }
    })
    .filter((r) => r.totalHits > 0 || r.duplicateHVBranches)

  const byType: Record<FindingType, number> = { M: 0, D: 0, O: 0, A: 0, X: 0, T: 0 }
  for (const report of fileReports) {
    for (const p of report.patternHits) {
      if (p) byType[p.type] += p.count
    }
  }

  const oneSidedExports = fileReports
    .flatMap((r) =>
      r.patternHits
        .filter(
          (p) =>
            p &&
            (p.label.includes('Horizontal in export') || p.label.includes('Vertical in export')),
        )
        .map((p) => ({ file: r.file, label: p!.label, count: p!.count })),
    )
    .filter((x) => x.count > 0)

  const inventory = {
    generatedAt,
    scanRoots: SCAN_DIRS,
    fileCount: files.length,
    filesWithHits: fileReports.length,
    totalsByType: byType,
    duplicateHVFiles: fileReports.filter((r) => r.duplicateHVBranches).map((r) => r.file),
    oneSidedNameDensity: oneSidedExports,
    files: fileReports,
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2), 'utf8')
  console.log(`Wrote ${outPath}`)
  console.log(`Files scanned: ${files.length}, with hits: ${fileReports.length}`)
  console.log('Totals by type:', byType)
}

main()
