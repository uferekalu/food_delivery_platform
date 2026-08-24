import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { VEHICLE_TYPES } from '../schemas/rider.schema';
import type { VehicleType } from '../schemas/rider.schema';

export class ApplyRiderDto {
  @ApiProperty({ enum: VEHICLE_TYPES })
  @IsIn(VEHICLE_TYPES)
  vehicleType: VehicleType;
}
