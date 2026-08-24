import { PartialType } from '@nestjs/swagger';
import { CreatePromoCodeDto } from './create-promo-code.dto';

// All fields optional (including `code` itself, e.g. to fix a typo) — most edits in practice are
// just deactivating a code or adjusting its usage limit/expiry.
export class UpdatePromoCodeDto extends PartialType(CreatePromoCodeDto) {}
