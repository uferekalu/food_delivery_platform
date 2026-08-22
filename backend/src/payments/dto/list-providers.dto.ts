import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ListProvidersDto {
  @ApiProperty({ example: 'NGN' })
  @IsString()
  @Length(3, 3)
  currency: string;
}
