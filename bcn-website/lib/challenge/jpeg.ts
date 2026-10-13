// Strip EXIF/IPTC/comment metadata (including GPS) without re-encoding pixels.
export function privateJpeg(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new Error("Upload a JPEG camera photo.");
  const chunks: Uint8Array[] = [input.slice(0, 2)]; let p = 2;
  while (p < input.length) {
    const start = p;
    if (input[p++] !== 0xff) throw new Error("Malformed JPEG.");
    while (input[p] === 0xff) p++;
    const marker = input[p++];
    if (marker === 0xd9) { chunks.push(input.slice(start, p)); return Buffer.concat(chunks); }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { chunks.push(input.slice(start, p)); continue; }
    if (p + 2 > input.length) throw new Error("Malformed JPEG.");
    const size = (input[p] << 8) | input[p + 1];
    if (size < 2 || p + size > input.length) throw new Error("Malformed JPEG.");
    if (![0xe1, 0xed, 0xfe].includes(marker)) chunks.push(input.slice(start, p + size));
    p += size;
    if (marker === 0xda) {
      const scanStart = p;
      while (p < input.length) {
        if (input[p] !== 0xff) { p++; continue; }
        let next = p + 1; while (input[next] === 0xff) next++;
        if (input[next] === 0x00 || (input[next] >= 0xd0 && input[next] <= 0xd7)) { p = next + 1; continue; }
        break;
      }
      chunks.push(input.slice(scanStart, p));
    }
  }
  throw new Error("Incomplete JPEG.");
}
