import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const UPLOAD_FOLDERS = [
  'restaurants',
  'menu-items',
  'avatars',
  'reviews',
  'compliance-documents',
  'rider-documents',
  // Grocery/pharmacy marketplace (docs/ROADMAP.md FDP-56/80) — mirrors 'restaurants'/'menu-items'.
  'stores',
  'products',
] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export class GetUploadSignatureDto {
  @ApiProperty({ enum: UPLOAD_FOLDERS })
  @IsIn(UPLOAD_FOLDERS)
  folder: UploadFolder;
}
