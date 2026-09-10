import { Module } from '@nestjs/common';
import { BusinessVerificationService } from './business-verification.service';

// A leaf module — imports nothing itself, so RestaurantsModule/StoresModule can both import it
// directly with zero cycle risk (same "safe, non-circular" shape as payments.module.ts's
// existing comment about RestaurantsModule).
@Module({
  providers: [BusinessVerificationService],
  exports: [BusinessVerificationService],
})
export class BusinessVerificationModule {}
