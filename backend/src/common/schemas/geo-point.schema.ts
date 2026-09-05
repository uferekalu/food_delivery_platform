import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * GeoJSON Point (docs/ROADMAP.md FDP-96) — the indexable counterpart of `Address.lat`/`lng`.
 * MongoDB's `2dsphere` index and `$geoNear` aggregation stage both require this exact shape
 * (`type: 'Point'`, `coordinates: [lng, lat]` — longitude first, the opposite order from how
 * `Address.lat`/`lng` and every form/DTO in this codebase already order the pair, since that's
 * GeoJSON's own fixed convention, not a choice this project made). Deliberately a separate field
 * from `lat`/`lng` rather than replacing them: every existing consumer (delivery-fee calculation,
 * the restaurant/store forms, `haversineDistanceKm`) already works in plain `{lat, lng}` terms,
 * and rewriting all of that to read GeoJSON coordinates would be pure churn for zero benefit —
 * `location` exists purely so a "restaurants/stores near me" query can use a real geospatial
 * index instead of pulling every approved row into Node and sorting in memory.
 */
@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, enum: ['Point'], required: true, default: 'Point' })
  type: 'Point';

  /** `[longitude, latitude]` — GeoJSON order, not `[lat, lng]`. */
  @Prop({ type: [Number], required: true })
  coordinates: [number, number];
}

export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);
