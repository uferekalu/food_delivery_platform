import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ResolvePaystackAccountDto {
  @ApiProperty({ description: 'NGN account number, digits only' })
  @IsString()
  @Matches(/^\d+$/, { message: 'accountNumber must contain digits only' })
  @MinLength(10)
  accountNumber: string;

  @ApiProperty({
    description: "The bank's Paystack code, from GET /payments/paystack/banks",
  })
  @IsString()
  bankCode: string;
}
