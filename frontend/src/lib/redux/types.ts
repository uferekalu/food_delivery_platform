import type { UserRole } from '@/lib/constants/roles';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isEmailVerified: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}
