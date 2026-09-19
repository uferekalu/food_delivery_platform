import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { GOVERNMENT_ID_TYPES, VEHICLE_TYPES } from '../schemas/rider.schema';
import type { GovernmentIdType, VehicleType } from '../schemas/rider.schema';
import { GuarantorDto } from './guarantor.dto';

// A motorized rider needs a license and a registered vehicle; a bicycle rider has neither —
// these fields are conditionally required rather than always-optional or always-required.
const requiresVehicleDocs = (dto: ApplyRiderDto) =>
  dto.vehicleType !== 'bicycle';

export class ApplyRiderDto {
  @ApiProperty({ enum: VEHICLE_TYPES })
  @IsIn(VEHICLE_TYPES)
  vehicleType: VehicleType;

  // The rider's own contact number (docs/ROADMAP.md FDP-134) — distinct from the guarantor/next-
  // of-kin phones below. Applying was the one place in the whole signup→apply flow that never
  // asked for it (account registration's own phone field is optional, and most riders skip it),
  // which left `assignRiderByOwner`'s "call rider" feature (docs/ROADMAP.md FDP-133) with nothing
  // to show for a lot of real riders. Same E.164-ish pattern as UpdateProfileDto.phone, so a
  // rider who already set one at signup and a rider setting it here for the first time both land
  // in the same `User.phone` field/format.
  @ApiProperty({
    description:
      "The rider's own contact number — shown to a seller once assigned so they can call.",
  })
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message:
      'Enter a valid phone number, digits only (an optional leading + is fine)',
  })
  phone: string;

  @ApiProperty({
    description: 'ISO date string — applicant must be at least 18 years old',
  })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ enum: GOVERNMENT_ID_TYPES })
  @IsIn(GOVERNMENT_ID_TYPES)
  governmentIdType: GovernmentIdType;

  @ApiProperty({ description: 'The ID document’s own reference number' })
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  governmentIdNumber: string;

  @ApiProperty({ description: 'Scan/photo of the government ID above' })
  @IsUrl()
  governmentIdDocumentUrl: string;

  @ApiProperty({
    description: 'A recent utility bill, bank statement, or tenancy agreement',
  })
  @IsUrl()
  proofOfAddressDocumentUrl: string;

  @ApiPropertyOptional({
    description: 'Required unless vehicleType is "bicycle"',
  })
  @ValidateIf(requiresVehicleDocs)
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  driversLicenseNumber?: string;

  @ApiPropertyOptional({
    description: 'Required unless vehicleType is "bicycle"',
  })
  @ValidateIf(requiresVehicleDocs)
  @IsDateString()
  driversLicenseExpiry?: string;

  @ApiPropertyOptional({
    description: 'Required unless vehicleType is "bicycle"',
  })
  @ValidateIf(requiresVehicleDocs)
  @IsUrl()
  driversLicenseDocumentUrl?: string;

  @ApiPropertyOptional({
    description: 'Required unless vehicleType is "bicycle"',
  })
  @ValidateIf(requiresVehicleDocs)
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  vehiclePlateNumber?: string;

  @ApiPropertyOptional({
    description:
      'Vehicle registration / roadworthiness document — required unless vehicleType is "bicycle"',
  })
  @ValidateIf(requiresVehicleDocs)
  @IsUrl()
  vehicleRegistrationDocumentUrl?: string;

  @ApiProperty({
    type: GuarantorDto,
    description: 'A surety who vouches for the applicant',
  })
  @ValidateNested()
  @Type(() => GuarantorDto)
  guarantor: GuarantorDto;

  @ApiProperty({
    description: 'Emergency contact, distinct from the guarantor',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nextOfKinName: string;

  @ApiProperty()
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  nextOfKinPhone: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nextOfKinRelationship: string;
}
