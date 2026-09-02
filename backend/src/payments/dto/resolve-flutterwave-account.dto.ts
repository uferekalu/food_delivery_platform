import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ResolveFlutterwaveAccountDto {
  @ApiProperty({ description: 'NGN account number, digits only' })
  @IsString()
  @Matches(/^\d+$/, { message: 'accountNumber must contain digits only' })
  @MinLength(10)
  accountNumber: string;

  @ApiProperty({
    description:
      "The bank's Flutterwave code, from GET /payments/flutterwave/banks",
  })
  @IsString()
  bankCode: string;
}
