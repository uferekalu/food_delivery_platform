import type { UserRole } from '@/lib/constants/roles';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isEmailVerified: boolean;
  avatarUrl: string | null;
  phone: string | null;
  isPhoneVerified: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}
