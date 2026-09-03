import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Moved from restaurants/dto/ (FDP-84) alongside common/schemas/opening-hour.schema.ts —
// Store's opening hours need the same validated shape as Restaurant's.
export class OpeningHourDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday … 6 = Saturday',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'openTime must be in HH:mm 24-hour format',
  })
  openTime: string;

  @ApiProperty({ example: '22:00' })
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'closeTime must be in HH:mm 24-hour format',
  })
  closeTime: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
