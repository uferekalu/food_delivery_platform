import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Payout, PayoutSchema } from './schemas/payout.schema';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      // Not yet written to by anything (docs/ROADMAP.md FDP-91 is the ledger-schema foundation
      // only) — registered now so the collection/indexes exist and the follow-up ticket that
      // actually creates Payout documents needs no further module wiring.
      { name: Payout.name, schema: PayoutSchema },
    ]),
  ],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
