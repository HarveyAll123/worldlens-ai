/**
 * The first file of a ZIP archive, decompressed with the platform's DecompressionStream
 * (Node 18+ and Cloudflare Workers) — enough for GDELT's one-file archives without a zip
 * dependency. Supports "stored" and "deflate" entries; not ZIP64 or encryption.
 */
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export async function unzipFirst(zip: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // End-of-central-directory record: 22 bytes plus an optional comment of up to 64 KiB.
  let eocd = -1;
  for (let i = zip.byteLength - 22; i >= Math.max(0, zip.byteLength - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: no end of central directory');
  const central = view.getUint32(eocd + 16, true);
  if (view.getUint32(central, true) !== CENTRAL) throw new Error('zip: bad central directory');
  // Sizes come from the central directory: the local header may defer them to a descriptor.
  const method = view.getUint16(central + 10, true);
  const compressedSize = view.getUint32(central + 20, true);
  const local = view.getUint32(central + 42, true);
  if (view.getUint32(local, true) !== LOCAL) throw new Error('zip: bad local header');
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return data;
  if (method !== 8) throw new Error(`zip: unsupported compression method ${method}`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
