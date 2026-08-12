// File gate and working-resolution math — the two guards that run before any tracing.
import assert from 'node:assert/strict'
import { validateFile, MAX_BYTES } from '../../src/vector.js'
import { fitSize } from '../../src/trace-core.js'

const file = (type, size) => ({type, size, name: 'x'})

// the three supported formats pass
for(const type of ['image/png', 'image/jpeg', 'image/webp'])
  assert.doesNotThrow(() => validateFile(file(type, 1024)))

// anything else is refused by type, not by extension. The message is an i18n key,
// so the panel can show it in the language the rest of the app is in.
assert.throws(() => validateFile(file('image/svg+xml', 1024)), /^Error: badType$/)
assert.throws(() => validateFile(file('application/pdf', 1024)), /^Error: badType$/)

// the 10 MB limit is inclusive, and an empty file is caught too
assert.doesNotThrow(() => validateFile(file('image/png', MAX_BYTES)))
assert.throws(() => validateFile(file('image/png', MAX_BYTES + 1)), /^Error: tooBig$/)
assert.throws(() => validateFile(file('image/png', 0)), /^Error: emptyFile$/)

// oversized images shrink on their longest side and keep their aspect ratio
assert.deepEqual(fitSize(4000, 2000, 1024), {width: 1024, height: 512})
assert.deepEqual(fitSize(2000, 4000, 1024), {width: 512, height: 1024})

// smaller images are never scaled up
assert.deepEqual(fitSize(300, 200, 1024), {width: 300, height: 200})

// an extreme ratio still yields a drawable canvas
assert.deepEqual(fitSize(8000, 3, 1024), {width: 1024, height: 1})
