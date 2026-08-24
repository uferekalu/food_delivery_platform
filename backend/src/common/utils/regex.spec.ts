import { escapeRegExp } from './regex';

describe('escapeRegExp', () => {
  it('leaves plain alphanumeric input unchanged', () => {
    expect(escapeRegExp('fd')).toBe('fd');
    expect(escapeRegExp('Burgundy Kitchen')).toBe('Burgundy Kitchen');
  });

  it('escapes regex metacharacters so they match literally', () => {
    expect(escapeRegExp('a.b')).toBe('a\\.b');
    expect(escapeRegExp('(test)')).toBe('\\(test\\)');
    expect(escapeRegExp('a+b*c?')).toBe('a\\+b\\*c\\?');
  });

  it('neutralizes a pathological pattern instead of leaving it exploitable', () => {
    const input = '(a+)+';
    const escaped = escapeRegExp(input);
    // The escaped string, used as a RegExp source, matches only the literal text — not a
    // catastrophic-backtracking pattern.
    expect(new RegExp(escaped).test('(a+)+')).toBe(true);
    expect(
      new RegExp(escaped).test(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
      ),
    ).toBe(false);
  });
});
