import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { NearbyQueryDto } from '../../common/dto/nearby-query.dto';
import { STORE_TYPES } from '../schemas/store.schema';
import type { StoreType } from '../schemas/store.schema';

/** Required, not optional — same reasoning as `ListStoresDto.type`: a category-listing page
 * always picks exactly one type (confirmed against the real Glovo pages, docs/ROADMAP.md
 * FDP-56), and "stores near me" is no different. */
export class NearbyStoresQueryDto extends NearbyQueryDto {
  @ApiProperty({ enum: STORE_TYPES })
  @IsIn(STORE_TYPES)
  type: StoreType;
}
