import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadFolder } from './dto/get-upload-signature.dto';

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Signs a direct-to-Cloudinary upload so the browser can upload the image itself — the
   * binary never passes through our server. See docs/ARCHITECTURE.md §Uploads.
   */
  generateSignature(folder: UploadFolder): UploadSignature {
    const timestamp = Math.round(Date.now() / 1000);
    const fullFolder = `food-delivery-platform/${folder}`;
    const apiSecret = this.config.getOrThrow<string>('CLOUDINARY_API_SECRET');

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: fullFolder },
      apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey: this.config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      cloudName: this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      folder: fullFolder,
    };
  }
}
