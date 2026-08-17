import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const UPLOAD_FOLDERS = ['restaurants', 'menu-items'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export class GetUploadSignatureDto {
  @ApiProperty({ enum: UPLOAD_FOLDERS })
  @IsIn(UPLOAD_FOLDERS)
  folder: UploadFolder;
}
