import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class AssignOrderRiderDto {
  @ApiProperty()
  @IsMongoId()
  riderUserId: string;
}
