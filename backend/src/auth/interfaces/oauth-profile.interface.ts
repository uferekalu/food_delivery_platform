/** Common shape both GoogleStrategy and FacebookStrategy normalize their provider's profile
 * into — AuthService.loginOrRegisterWithOAuthProfile() doesn't need to know which provider
 * authenticated the person, just their verified email/name/avatar. */
export interface OAuthProfile {
  email: string;
  name: string;
  avatarUrl: string | null;
}
