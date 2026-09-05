/**
 * Baseline marker (docs/ROADMAP.md FDP-88) — every schema change before this point was applied
 * the way Mongoose always handles a new optional field: automatically, with no explicit
 * migration, since a missing field on an old document just reads back as `undefined`/the
 * schema's `default`. This migration is a deliberate no-op; its only purpose is to give
 * `migrate-mongo`'s `changelog` collection a first entry so `npm run migrate:up` has a
 * well-defined starting point on every environment (including production, which already has
 * real data) rather than nothing to compare against. See docs/ARCHITECTURE.md §15 and
 * docs/ENGINEERING_RULES.md for when a schema change actually needs a real migration from here
 * on — this file is not a template to copy for that; see the newer migrations in this directory
 * (once one exists) instead.
 */
module.exports = {
  async up() {
    // Intentionally empty — see file header comment.
  },

  async down() {
    // Intentionally empty — see file header comment.
  },
};
