import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUploadSignatureDto } from './dto/get-upload-signature.dto';
import { UploadsService } from './uploads.service';
import type { UploadSignature } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Roles('restaurant_owner', 'admin')
  @Get('signature')
  getSignature(@Query() query: GetUploadSignatureDto): UploadSignature {
    return this.uploadsService.generateSignature(query.folder);
  }
}
