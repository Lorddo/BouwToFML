import fs from 'node:fs'
const html = fs.readFileSync(process.argv[2], 'utf8')
const cards = [...html.matchAll(/<article class="ref-card ([^"]+)">([\s\S]*?)<\/article>/g)]
for (const [, kind, body] of cards) {
  const h2 = (body.match(/<h2>([^<]+)<\/h2>/) || [])[1]
  console.log('\n===', kind, h2, '===')
  for (const m of body.matchAll(/<strong>Primitives:<\/strong> ([^<]+)/g)) console.log('PRIM', m[1])
  for (const m of body.matchAll(/<p class="muted">([^<]+)<\/p>/g)) {
    const t = m[1].trim()
    if (/bbox|LBE|lijnen|Scores|Stijl|dikte|units/.test(t)) console.log(' ', t.slice(0, 220))
  }
  for (const jb of body.matchAll(/<pre class="json">([\s\S]*?)<\/pre>/g)) {
    const raw = jb[1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    try {
      const j = JSON.parse(raw)
      if (j.renderStyle)
        console.log('WALL', {
          style: j.renderStyle,
          th: j.thicknessPx,
          orient: j.orientation,
          w: j.cropWidth,
          h: j.cropHeight,
        })
      if (j.units) {
        console.log('N_UNITS', j.units.length)
        for (const u of j.units) {
          const b = u.unit?.bbox ?? u.bbox
          console.log(
            ' unit',
            u.unit?.source ?? u.source,
            b,
            u.primitives && {
              k: u.primitives.kopeinde,
              d: u.primitives.draaicirkel,
              g: u.primitives.draaicirkelGraden,
              p: u.primitives.parallelLinesBetweenHeads,
            },
          )
        }
      }
    } catch (e) {
      console.log('json', e.message)
    }
  }
}
