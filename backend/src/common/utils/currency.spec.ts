import { formatMoney } from './currency';

describe('formatMoney', () => {
  it('prepends the narrow currency symbol with thousands grouping', () => {
    expect(formatMoney(1000, 'NGN')).toBe('₦1,000.00');
  });

  it('always shows two decimal places', () => {
    expect(formatMoney(5, 'USD')).toBe('$5.00');
  });

  it('falls back to "CODE amount" for an unrecognized currency code', () => {
    expect(formatMoney(1000, 'NOTACODE')).toBe('NOTACODE 1000.00');
  });
});
