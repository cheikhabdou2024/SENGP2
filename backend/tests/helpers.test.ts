import { Helpers } from '../src/utils/helpers';

describe('Helpers.getPaginationParams', () => {
  it('calcule le décalage à partir de la page', () => {
    expect(Helpers.getPaginationParams(3, 20)).toEqual({ page: 3, limit: 20, offset: 40 });
  });

  it('borne la page et la limite', () => {
    expect(Helpers.getPaginationParams(0, 500)).toEqual({ page: 1, limit: 100, offset: 0 });
    expect(Helpers.getPaginationParams(-4, 0)).toEqual({ page: 1, limit: 1, offset: 0 });
  });
});

describe('Helpers.calculateCommission', () => {
  it('applique le pourcentage et arrondit au franc', () => {
    expect(Helpers.calculateCommission(35000, 15)).toBe(5250);
    expect(Helpers.calculateCommission(1001, 15)).toBe(150);
  });
});

describe('Helpers.isValidPhone', () => {
  it('accepte le format sénégalais avec ou sans indicatif', () => {
    expect(Helpers.isValidPhone('+221771234567')).toBe(true);
    expect(Helpers.isValidPhone('77 123 45 67')).toBe(true);
  });

  it('refuse un numéro trop court', () => {
    expect(Helpers.isValidPhone('1234')).toBe(false);
  });
});

describe('Helpers.calculateTotalPages', () => {
  it('arrondit à la page supérieure', () => {
    expect(Helpers.calculateTotalPages(41, 20)).toBe(3);
    expect(Helpers.calculateTotalPages(0, 20)).toBe(0);
  });
});
