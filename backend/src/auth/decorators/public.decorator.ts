import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks an endpoint as not requiring authentication — the global JwtAuthGuard checks for this. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
