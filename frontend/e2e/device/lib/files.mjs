// Test files for the pickers. Small real ones come from the repo; the oversized ones are made
// here so 50 MB of padding never lands in git. All go to /sdcard/Download/OpenFettleTest (and the
// one photo to its own album) and are deleted again by the runner's teardown.
import { writeFileSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { adb, shell, pushTestFile, waitFor } from './device.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_LABS = join(HERE, '../../../src/lib/labs/fixtures')
const MB = 1024 * 1024

export async function prepareFiles(out) {
  const dir = join(out, 'files')
  shell('mkdir', '-p', '/sdcard/Download/OpenFettleTest')
  const put = (name, from) => { pushTestFile(from, name); return name }
  const make = (name, write) => { const p = join(dir, name); write(p); return put(name, p) }
  mkdirSync(dir, { recursive: true })
  const files = {
    digitalPdf: put('ofreg-digital.pdf', join(REPO_LABS, 'getbased-reference-us-v2.pdf')),   // 68 markers, text layer
    scannedPdf: put('ofreg-scanned.pdf', join(HERE, '../fixtures/files/ofreg-scanned.pdf')), // the same report as images (OCR)
    strongCsv: put('ofreg-strong.csv', join(HERE, '../fixtures/files/ofreg-strong.csv')),    // 2 workouts, one unfinished 0-rep set
    notBackup: make('ofreg-notbackup.json', p => writeFileSync(p, '{"hello":"world","list":[1,2,3]}')),
    bigJson: make('ofreg-big.json', p => pad(p, '{"pad":"', '"}', 21 * MB)),                 // over the 20 MB backup limit
    bigPdf: make('ofreg-oversize.pdf', p => pad(p, '%PDF-1.4\n%', '\n%%EOF\n', 26 * MB)),     // over the 25 MB lab-report limit
  }
  // the photo picker: one image alone in its own album
  shell('mkdir', '-p', '/sdcard/Pictures/OpenFettleTest')
  adb('push', join(REPO_LABS, 'reference-page1-photo.jpg'), '/sdcard/Pictures/OpenFettleTest/ofreg-photo.jpg')
  shell('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Pictures/OpenFettleTest/ofreg-photo.jpg')
  // the pickers search Android's media index: wait until it lists every test file (the query
  // names our files only, so nothing of the user's is read)
  const want = [...Object.values(files), 'ofreg-photo.jpg']
  await waitFor(() => { const seen = indexed(); return want.every(n => seen.includes(n)) }, { timeout: 30000, label: 'the media index to list the test files' })
  return { ...files, dir, push: (name, local) => put(name, local) }
}
export const indexed = () => shell('content', 'query', '--uri', 'content://media/external/file', '--projection', '_display_name', '--where', `"_display_name LIKE 'ofreg-%'"`)
  .match(/_display_name=ofreg-[^\s,]+/g)?.map(s => s.slice(14)) || []

function pad(path, head, tail, size) {
  const fd = openSync(path, 'w'), chunk = Buffer.alloc(MB, 'x')
  writeSync(fd, head)
  for (let n = head.length + tail.length; n < size; n += MB) writeSync(fd, chunk)
  writeSync(fd, tail); closeSync(fd)
}
