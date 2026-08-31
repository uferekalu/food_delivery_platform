import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import { PHONE_OTP_PURPOSES } from '../schemas/phone-otp.schema';
import type { PhoneOtpPurpose } from '../schemas/phone-otp.schema';

export class VerifyPhoneCodeDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message:
      'Enter a valid phone number, digits only (an optional leading + is fine)',
  })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({ enum: PHONE_OTP_PURPOSES })
  @IsIn(PHONE_OTP_PURPOSES)
  purpose: PhoneOtpPurpose;
}
