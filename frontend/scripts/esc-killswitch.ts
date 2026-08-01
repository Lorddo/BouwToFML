#!/usr/bin/env node
/**
 * Kill-switch runner: per kandidaat-ID E2E draaien met ESC_OFF=<id> en snapshot-diff rapporteren.
 *
 * Usage:
 *   node --experimental-strip-types scripts/esc-killswitch.ts
 *   node --experimental-strip-types scripts/esc-killswitch.ts D-52 D-51
 *
 * Vergelijkt snapshot-bestanden via inhouds-hash (fixtures mogen untracked zijn in git).
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..')
const FIXTURES_ROOT = path.join(FRONTEND_ROOT, 'tests/e2e/fixtures')

/** Resterende kill-switch kandidaten (D-45/49/53/R-26 weg; W-14 dode niveaus weg 2026-08-01). */
const DEFAULT_CANDIDATES = ['D-50', 'D-51', 'D-52', 'W-07']

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, acc)
    else if (/\.(json|fml)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

/** Hash van alle snapshot json/fml onder fixtures (rel path → sha256). */
function snapshotFingerprint(): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of walkFiles(FIXTURES_ROOT)) {
    if (!file.includes(`${path.sep}snapshot${path.sep}`)) continue
    const rel = path.relative(FIXTURES_ROOT, file).replace(/\\/g, '/')
    const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    out.set(rel, hash)
  }
  return out
}

function restoreSnapshots(baseline: Map<string, string>, baselineBytes: Map<string, Buffer>): void {
  for (const [rel, buf] of baselineBytes) {
    const full = path.join(FIXTURES_ROOT, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, buf)
  }
  // Verwijder bestanden die tijdens de run zijn toegevoegd.
  const now = snapshotFingerprint()
  for (const rel of now.keys()) {
    if (!baseline.has(rel)) {
      fs.unlinkSync(path.join(FIXTURES_ROOT, rel))
    }
  }
}

function loadBaselineBytes(): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  for (const file of walkFiles(FIXTURES_ROOT)) {
    if (!file.includes(`${path.sep}snapshot${path.sep}`)) continue
    const rel = path.relative(FIXTURES_ROOT, file).replace(/\\/g, '/')
    out.set(rel, fs.readFileSync(file))
  }
  return out
}

function diffFingerprints(before: Map<string, string>, after: Map<string, string>): string[] {
  const changes: string[] = []
  for (const [rel, hash] of after) {
    const prev = before.get(rel)
    if (prev == null) changes.push(`+ ${rel}`)
    else if (prev !== hash) changes.push(`M ${rel}`)
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) changes.push(`- ${rel}`)
  }
  return changes
}

function runE2e(escOff: string): { ok: boolean; output: string } {
  const env = { ...process.env, ESC_OFF: escOff }
  const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.e2e.config.ts'], {
    cwd: FRONTEND_ROOT,
    encoding: 'utf8',
    env,
    shell: true,
    timeout: 600_000,
  })
  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  return { ok: r.status === 0, output }
}

function main(): void {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const candidates = ids.length > 0 ? ids : DEFAULT_CANDIDATES

  const baseline = snapshotFingerprint()
  const baselineBytes = loadBaselineBytes()
  console.log(`Kill-switch runner — kandidaten: ${candidates.join(', ')}`)
  console.log(`Baseline snapshots: ${baseline.size} bestanden\n`)

  const results: Array<{
    id: string
    e2eOk: boolean
    snapshotChanged: boolean
    changes: string[]
  }> = []

  for (const id of candidates) {
    console.log(`\n=== ESC_OFF=${id} ===`)
    restoreSnapshots(baseline, baselineBytes)

    const { ok, output } = runE2e(id)
    const after = snapshotFingerprint()
    const changes = diffFingerprints(baseline, after)
    const snapshotChanged = changes.length > 0
    results.push({ id, e2eOk: ok, snapshotChanged, changes })

    console.log(ok ? 'E2E: PASS' : 'E2E: FAIL')
    console.log(
      snapshotChanged
        ? `Snapshot-diff (${changes.length}):\n${changes.slice(0, 20).join('\n')}`
        : 'Snapshot: ongewijzigd',
    )
    if (!ok) {
      const tail = output.split(/\r?\n/).slice(-40).join('\n')
      console.log('--- vitest tail ---\n' + tail)
    }
  }

  restoreSnapshots(baseline, baselineBytes)

  console.log('\n## Samenvatting\n')
  console.log('| ID | E2E | Snapshot | Verdict-hint |')
  console.log('|---|---|---|---|')
  for (const r of results) {
    const hint =
      r.e2eOk && !r.snapshotChanged
        ? 'uit → geen verschil → VERWIJDEREN veilig t.o.v. huidige fixtures'
        : r.e2eOk && r.snapshotChanged
          ? 'uit → snapshot wijzigt → pad dekt iets'
          : 'uit → E2E faalt → pad is nodig of test te strak'
    console.log(
      `| ${r.id} | ${r.e2eOk ? 'pass' : 'fail'} | ${r.snapshotChanged ? 'wijzigt' : 'gelijk'} | ${hint} |`,
    )
  }

  const reportPath = path.join(REPO_ROOT, '.cursor/docs/archive/escalatie/killswitch-report.md')
  const date = new Date().toISOString().slice(0, 10)
  const md = [
    `# Escalatie kill-switch rapport`,
    '',
    `Gegenereerd: ${date} · \`npm run esc:killswitch\``,
    '',
    '| ID | E2E | Snapshot | Hint |',
    '|---|---|---|---|',
    ...results.map((r) => {
      const hint =
        r.e2eOk && !r.snapshotChanged
          ? 'geen verschil → VERWIJDEREN-kandidaat'
          : r.e2eOk && r.snapshotChanged
            ? `snapshot wijzigt (${r.changes.length})`
            : 'E2E faalt'
      return `| ${r.id} | ${r.e2eOk ? 'pass' : 'fail'} | ${r.snapshotChanged ? 'wijzigt' : 'gelijk'} | ${hint} |`
    }),
    '',
  ].join('\n')
  fs.writeFileSync(reportPath, md, 'utf8')
  console.log(`\nRapport: ${reportPath}`)
}

main()
