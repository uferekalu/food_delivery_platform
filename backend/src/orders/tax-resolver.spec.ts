import { TaxResolver } from './tax-resolver';

describe('TaxResolver', () => {
  const resolver = new TaxResolver();

  it('returns the standard national VAT rate for each currently-supported currency', () => {
    expect(resolver.getRate('NGN')).toBe(0.075);
    expect(resolver.getRate('GHS')).toBe(0.15);
    expect(resolver.getRate('KES')).toBe(0.16);
    expect(resolver.getRate('ZAR')).toBe(0.15);
    expect(resolver.getRate('UGX')).toBe(0.18);
    expect(resolver.getRate('GBP')).toBe(0.2);
  });

  it('is case-insensitive on the currency code', () => {
    expect(resolver.getRate('ngn')).toBe(0.075);
  });

  it('defaults to 0 for a currency with no single accurate national flat rate (USD, EUR)', () => {
    expect(resolver.getRate('USD')).toBe(0);
    expect(resolver.getRate('EUR')).toBe(0);
  });

  it('defaults to 0 for any currency the table simply does not cover yet', () => {
    expect(resolver.getRate('XYZ')).toBe(0);
  });

  it('calculates tax as taxableAmount * rate, rounded to 2 decimal places', () => {
    expect(resolver.calculate(230, 'NGN')).toBe(17.25); // 230 * 0.075
    expect(resolver.calculate(100, 'GBP')).toBe(20); // 100 * 0.20
  });

  it('is 0 for a currency with no rate configured, regardless of the taxable amount', () => {
    expect(resolver.calculate(1000, 'USD')).toBe(0);
  });

  it('clamps a negative taxable amount to 0 rather than returning negative tax', () => {
    expect(resolver.calculate(-50, 'NGN')).toBe(0);
  });
});
