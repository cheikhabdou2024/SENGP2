import { safeEqual } from '../src/utils/safeEqual';

describe('safeEqual', () => {
  it('compare des secrets identiques', () => {
    expect(safeEqual('s3cret-value', 's3cret-value')).toBe(true);
  });

  it('refuse des secrets différents, de longueurs différentes ou vides', () => {
    expect(safeEqual('s3cret-value', 's3cret-valuf')).toBe(false);
    expect(safeEqual('court', 'beaucoup-plus-long')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
