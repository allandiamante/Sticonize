// zipStore: headers, CRC and the central directory closing with the EOCD.
import assert from 'node:assert/strict'
import { zipStore } from '../../src/scribble.js'

// The accented name is deliberate: if the name length were counted in characters instead
// of UTF-8 bytes, the buffer would overflow and the set() below would already throw.
const zip = zipStore([
  {name: 'a.txt', data: new TextEncoder().encode('123456789')},
  {name: 'ação.txt', data: new Uint8Array([0, 255])}
], new Date(2026, 7, 9, 12, 30, 0))
const dv = new DataView(zip.buffer)

assert.equal(dv.getUint32(0, true), 0x04034b50)      // first local file header signature
assert.equal(dv.getUint16(6, true), 0x0800)          // UTF-8 filename flag
assert.equal(dv.getUint16(8, true), 0)               // method 0 = store
assert.equal(dv.getUint32(14, true), 0xCBF43926)     // crc32("123456789"), the canonical value
assert.equal(dv.getUint32(18, true), 9)              // compressed == uncompressed under store
assert.equal(dv.getUint32(22, true), 9)

const eocd = zip.length - 22
assert.equal(dv.getUint32(eocd, true), 0x06054b50)
assert.equal(dv.getUint16(eocd + 10, true), 2)       // two entries
const cdAt = dv.getUint32(eocd + 16, true)
assert.equal(dv.getUint32(cdAt, true), 0x02014b50)
assert.equal(dv.getUint32(eocd + 12, true), eocd - cdAt)   // the directory ends exactly at the EOCD
// second file's offset in the directory: 30 + 5 (name) + 9 (data) = 44
assert.equal(dv.getUint32(cdAt + 46 + 5 + 42, true), 44)
