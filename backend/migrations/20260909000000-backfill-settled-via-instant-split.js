/**
 * Weekly payout execution (docs/ROADMAP.md FDP-92) — this is the one schema change in that
 * ticket that genuinely needs a real migration, not just Mongoose's "missing field reads back as
 * the default" handling that every other new-optional-field change in this codebase gets away
 * with (see docs/ENGINEERING_RULES.md for that distinction).
 *
 * `Order.settledViaInstantSplit` exists to stop the new weekly-batch payout job from paying a
 * vendor a SECOND time for an order whose provider-side instant split (docs/ARCHITECTURE.md §14,
 * still live and running in parallel throughout this staged rollout) already sent them their cut
 * automatically at charge time. Going forward, `PaymentsService.initiatePayment` sets this flag
 * itself on every new order — but it defaults to `false` for every order that already existed
 * before this field did, INCLUDING ones that genuinely did settle via the instant split. Left
 * unbackfilled, every one of those historical orders would look eligible for the weekly batch and
 * get paid out a second time — exactly the double-pay "loophole" this whole epic exists to avoid.
 *
 * There's no exact historical record of "was the split actually applied to this specific charge"
 * (that decision was never persisted before this ticket) — this migration uses the closest safe
 * proxy: for every already-DELIVERED, not-yet-batch-claimed order, check whether that order's
 * seller currently has an *active* payout account for the exact provider that order was charged
 * through. If so, mark it `settledViaInstantSplit: true`.
 *
 * This is deliberately a conservative, over-inclusive heuristic — biased toward the SAFE failure
 * mode. A seller who activated their payout account only *after* some of these historical orders
 * were placed will have those particular orders wrongly marked `true` too; the practical effect
 * is just that those specific orders are excluded from the weekly batch and need a manual
 * one-off reconciliation for the platform to settle them outside the automated flow — an
 * inconvenience, never a double payment. The reverse mistake (marking a genuinely-already-paid
 * order `false`) is the one this migration is written to avoid at all costs, since that's the
 * one that actually loses the platform money.
 */
module.exports = {
  async up(db) {
    const activeAccountsBySeller = new Map();

    const [restaurants, stores] = await Promise.all([
      db
        .collection('restaurants')
        .find(
          { 'payoutAccounts.status': 'active' },
          { projection: { payoutAccounts: 1 } },
        )
        .toArray(),
      db
        .collection('stores')
        .find(
          { 'payoutAccounts.status': 'active' },
          { projection: { payoutAccounts: 1 } },
        )
        .toArray(),
    ]);

    for (const doc of [...restaurants, ...stores]) {
      const providers = new Set(
        (doc.payoutAccounts || [])
          .filter((a) => a.status === 'active')
          .map((a) => a.provider),
      );
      if (providers.size > 0) {
        activeAccountsBySeller.set(doc._id.toString(), providers);
      }
    }

    if (activeAccountsBySeller.size === 0) {
      // No vendor has ever onboarded a payout account — nothing could have been instant-split,
      // so there's nothing to backfill.
      return;
    }

    const candidates = await db
      .collection('orders')
      .find(
        {
          status: 'DELIVERED',
          vendorPayoutId: null,
          settledViaInstantSplit: { $ne: true },
        },
        {
          projection: {
            sellerType: 1,
            restaurantId: 1,
            storeId: 1,
            paymentProvider: 1,
          },
        },
      )
      .toArray();

    const idsToMark = [];
    for (const order of candidates) {
      const sellerId =
        order.sellerType === 'store' ? order.storeId : order.restaurantId;
      if (!sellerId) continue;
      const providers = activeAccountsBySeller.get(sellerId.toString());
      if (providers && providers.has(order.paymentProvider)) {
        idsToMark.push(order._id);
      }
    }

    if (idsToMark.length === 0) return;

    await db
      .collection('orders')
      .updateMany(
        { _id: { $in: idsToMark } },
        { $set: { settledViaInstantSplit: true } },
      );
  },

  async down(db) {
    // Deliberately not reversed — this only ever flips `false` -> `true` on historical orders
    // that (by the heuristic above) really were already paid via the instant split. Reversing it
    // would put those orders back into the weekly batch's unpaid pool, re-creating the exact
    // double-pay risk this migration exists to close. A `down` that's a safe no-op is correct
    // here, not a shortcut — see the baseline migration for the same reasoning applied more
    // trivially.
  },
};
