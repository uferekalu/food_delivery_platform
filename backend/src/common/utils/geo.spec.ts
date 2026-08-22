import { haversineDistanceKm } from './geo';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceKm({ lat: 6.5, lng: 3.4 }, { lat: 6.5, lng: 3.4 })).toBe(0);
  });

  it('is symmetric', () => {
    const a = { lat: 6.5244, lng: 3.3792 };
    const b = { lat: 6.6018, lng: 3.3515 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });

  it('matches a known real-world distance (Lagos to Ibadan, ~120km great-circle)', () => {
    const lagos = { lat: 6.5244, lng: 3.3792 };
    const ibadan = { lat: 7.3775, lng: 3.947 };
    expect(haversineDistanceKm(lagos, ibadan)).toBeGreaterThan(100);
    expect(haversineDistanceKm(lagos, ibadan)).toBeLessThan(140);
  });

  it('roughly matches the 111.32km-per-degree-latitude approximation for a pure north-south offset', () => {
    const distanceKm = haversineDistanceKm(
      { lat: 6.5, lng: 3.4 },
      { lat: 6.6, lng: 3.4 },
    );
    expect(distanceKm).toBeCloseTo(11.132, 0);
  });
});
