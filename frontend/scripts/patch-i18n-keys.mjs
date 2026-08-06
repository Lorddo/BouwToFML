import { readFileSync, writeFileSync } from 'node:fs'

const patches = {
  en: {
    'common.opencvLoadFailed': 'OpenCV could not be loaded.',
    'result.clipboardUnavailable': 'Copy to clipboard is not available in this browser/context.',
    'templates.status.measuringReference': 'Measuring reference wall and classifying…',
    'templates.status.loadingOpenCv': 'Loading OpenCV…',
    'templates.status.processingInkChanges': 'Processing ink changes…',
    'input.errors.loadDrawingFirst': 'Load a PNG/JPG floor plan first.',
  },
  nl: {
    'common.opencvLoadFailed': 'OpenCV kon niet geladen worden.',
    'result.clipboardUnavailable':
      'Kopiëren naar klembord is niet beschikbaar in deze browser/context.',
    'templates.status.measuringReference': 'Referentiemuur meten en classificeren…',
    'templates.status.loadingOpenCv': 'OpenCV laden…',
    'templates.status.processingInkChanges': 'Inktwijzigingen verwerken…',
    'input.errors.loadDrawingFirst': 'Laad eerst een PNG/JPG bouwtekening.',
  },
  th: {
    'common.opencvLoadFailed': 'โหลด OpenCV ไม่ได้',
    'result.clipboardUnavailable': 'คัดลอกไปยังคลิปบอร์ดใช้ไม่ได้ในเบราว์เซอร์/บริบทนี้',
    'templates.status.measuringReference': 'กำลังวัดผนังอ้างอิงและจำแนก…',
    'templates.status.loadingOpenCv': 'กำลังโหลด OpenCV…',
    'templates.status.processingInkChanges': 'กำลังประมวลผลการเปลี่ยนแปลงหมึก…',
    'input.errors.loadDrawingFirst': 'โหลดแบบแปลน PNG/JPG ก่อน',
  },
}

function setPath(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    cur[key] ??= {}
    cur = cur[key]
  }
  cur[parts[parts.length - 1]] = value
}

for (const locale of ['en', 'nl', 'th']) {
  const path = `src/ui/i18n/locales/${locale}.json`
  const data = JSON.parse(readFileSync(path, 'utf8'))
  for (const [key, value] of Object.entries(patches[locale])) {
    setPath(data, key, value)
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
  console.log('patched', locale)
}
