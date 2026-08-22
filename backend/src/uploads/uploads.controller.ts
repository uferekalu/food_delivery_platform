import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUploadSignatureDto } from './dto/get-upload-signature.dto';
import { UploadsService } from './uploads.service';
import type { UploadSignature } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // No @Roles() — every authenticated role can request a signature now that 'avatars' (any
  // user) sits alongside 'restaurants'/'menu-items' (owner/admin only in practice). A signed
  // upload URL alone can't mutate any record; the actual write still goes through its own
  // service-layer ownership check (e.g. RestaurantsService.assertOwnerOrAdmin) when the
  // resulting URL is saved, same as the rest of this codebase's ownership pattern.
  @Get('signature')
  getSignature(@Query() query: GetUploadSignatureDto): UploadSignature {
    return this.uploadsService.generateSignature(query.folder);
  }
}
