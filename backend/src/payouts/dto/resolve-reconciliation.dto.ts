import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ResolveReconciliationDto {
  @ApiProperty({
    description:
      'What the admin found on the provider dashboard: did the transfer actually complete?',
  })
  @IsBoolean()
  transferActuallySucceeded: boolean;
}
