import {
  displayWorkshopCode,
  generateWorkshopCode,
  normalizeWorkshopCode,
} from './workshop-code.js';

describe('workshop codes', () => {
  it('normalizes printed codes at the read boundary', () => {
    expect(normalizeWorkshopCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(displayWorkshopCode('abcdefgh')).toBe('ABCD-EFGH');
  });

  it('generates eight unambiguous Crockford characters', () => {
    expect(generateWorkshopCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});
