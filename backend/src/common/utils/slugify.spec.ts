import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Burgundy Kitchen')).toBe('burgundy-kitchen');
  });

  it('collapses punctuation and repeated separators into a single hyphen', () => {
    expect(slugify("Jane's Café & Grill!!")).toBe('jane-s-caf-grill');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });
});
