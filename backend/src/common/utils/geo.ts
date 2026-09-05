interface Coordinates {
  lat: number;
  lng: number;
}

/** GeoJSON Point — see `common/schemas/geo-point.schema.ts` for why this is a separate shape
 * from `Coordinates` above (coordinate order is reversed: `[lng, lat]`, GeoJSON's fixed
 * convention). Duplicated here rather than imported from the schema file to keep this a plain
 * utility module with no Mongoose/NestJS dependency. */
interface GeoPointLike {
  type: 'Point';
  coordinates: [number, number];
}

/** Derives the GeoJSON `location` field (docs/ROADMAP.md FDP-96) from the `lat`/`lng` a
 * restaurant/store owner actually fills in on their address form — `null` when either is
 * missing, so a vendor who never set coordinates simply never shows up in a "near me" query
 * rather than indexing a meaningless `(0, 0)` point. Call this every time an address is
 * created/updated, not just once — an owner correcting a typo'd coordinate must also correct
 * where the geospatial index thinks they are. */
export function toGeoPoint(
  lat: number | null | undefined,
  lng: number | null | undefined,
): GeoPointLike | null {
  if (lat == null || lng == null) return null;
  return { type: 'Point', coordinates: [lng, lat] };
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in kilometres. */
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
