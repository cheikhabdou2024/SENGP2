export interface DetectedFile {
  mime: string;
  ext: string;
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

const ascii = (buf: Buffer, start: number, end: number): string => buf.toString('latin1', start, end);

/**
 * Identify an uploaded file from its leading bytes. Only the formats the app needs
 * (photos of identity documents and parcels, voice messages) are recognised;
 * anything else, including SVG, HTML and scripts, returns null.
 */
export function detectFileType(buf: Buffer): DetectedFile | null {
  if (!buf || buf.length < 12) return null;

  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (ascii(buf, 0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'audio/webm', ext: 'webm' };
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (/^(heic|heix|hevc|mif1)/.test(brand)) return { mime: 'image/heic', ext: 'heic' };
    return { mime: 'audio/mp4', ext: 'm4a' };
  }
  if (ascii(buf, 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3' };

  return null;
}
