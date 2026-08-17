import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  let service: UploadsService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              CLOUDINARY_CLOUD_NAME: 'test-cloud',
              CLOUDINARY_API_KEY: '123456789',
              CLOUDINARY_API_SECRET: 'test-secret',
            }),
          ],
        }),
      ],
      providers: [UploadsService],
    }).compile();

    service = moduleRef.get(UploadsService);
  });

  it('scopes the folder under the app namespace', () => {
    const result = service.generateSignature('restaurants');
    expect(result.folder).toBe('food-delivery-platform/restaurants');
    expect(result.cloudName).toBe('test-cloud');
    expect(result.apiKey).toBe('123456789');
  });

  it('produces a signature that Cloudinary would verify as valid', () => {
    const result = service.generateSignature('menu-items');
    const expected = cloudinary.utils.api_sign_request(
      { timestamp: result.timestamp, folder: result.folder },
      'test-secret',
    );
    expect(result.signature).toBe(expected);
  });

  it('issues a fresh timestamp on every call', async () => {
    const first = service.generateSignature('restaurants');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = service.generateSignature('restaurants');
    expect(second.timestamp).toBeGreaterThan(first.timestamp);
  });
});
