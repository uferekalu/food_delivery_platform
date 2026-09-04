import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, currencySymbol } from "./currency";

describe("formatMoney", () => {
  it("prepends the narrow currency symbol with thousands separators", () => {
    expect(formatMoney(1000, "NGN", "en")).toBe("₦1,000.00");
  });

  it("always renders two decimal places, even for a whole number", () => {
    expect(formatMoney(5, "USD", "en")).toBe("$5.00");
  });

  it("formats a negative amount with a leading minus before the symbol", () => {
    expect(formatMoney(-500, "USD", "en")).toBe("-$500.00");
  });

  it("respects the viewer's locale for grouping/decimal separators", () => {
    expect(formatMoney(1000, "EUR", "de")).toBe("1.000,00 €");
  });

  it("falls back to a bare 2-decimal number when no currency code is given", () => {
    expect(formatMoney(1000, undefined, "en")).toBe("1000.00");
    expect(formatMoney(1000, null, "en")).toBe("1000.00");
  });

  it("falls back to code-prefixed text for an unrecognized currency code", () => {
    expect(formatMoney(1000, "NOT_A_CODE", "en")).toBe("NOT_A_CODE 1000.00");
  });
});

describe("formatNumber", () => {
  it("groups thousands with no currency attached", () => {
    expect(formatNumber(1000000, "en")).toBe("1,000,000");
  });
});

describe("currencySymbol", () => {
  it("resolves the narrow symbol for a well-known currency", () => {
    expect(currencySymbol("NGN", "en")).toBe("₦");
    expect(currencySymbol("USD", "en")).toBe("$");
  });

  it("returns an empty string when no code is given", () => {
    expect(currencySymbol(undefined, "en")).toBe("");
    expect(currencySymbol(null, "en")).toBe("");
  });

  it("falls back to the code itself for an unrecognized currency", () => {
    expect(currencySymbol("NOT_A_CODE", "en")).toBe("NOT_A_CODE");
  });
});
