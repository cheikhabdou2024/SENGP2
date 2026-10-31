import { detectFileType } from '../src/utils/fileType';

const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);

describe('detectFileType', () => {
  it('reconnaît JPEG, PNG, WebP, WAV, OGG et WebM par leurs octets', () => {
    expect(detectFileType(pad([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(detectFileType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe('image/png');
    expect(detectFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))?.mime).toBe('image/webp');
    expect(detectFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]))?.mime).toBe('audio/wav');
    expect(detectFileType(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))?.mime).toBe('audio/ogg');
    expect(detectFileType(pad([0x1a, 0x45, 0xdf, 0xa3]))?.mime).toBe('audio/webm');
  });

  it('reconnaît les conteneurs MP4/M4A et HEIC', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(16)]);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
    expect(detectFileType(mp4)?.mime).toBe('audio/mp4');
    expect(detectFileType(heic)?.mime).toBe('image/heic');
  });

  it('refuse SVG, HTML, scripts et fichiers trop courts, quel que soit le nom déclaré', () => {
    expect(detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))).toBeNull();
    expect(detectFileType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectFileType(Buffer.from('#!/bin/sh\nrm -rf /\n'))).toBeNull();
    expect(detectFileType(Buffer.from('abc'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});
