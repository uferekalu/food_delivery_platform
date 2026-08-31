import { api } from "../api";
import { clearSession, setSession } from "../slices/auth-slice";
import type { AuthResponse, PublicUser } from "../types";
import type { SelfRegisterableRole } from "@/lib/constants/roles";
import { disconnectSocket } from "@/lib/socket";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role?: SelfRegisterableRole;
  phone?: string;
  phoneVerificationToken?: string;
}

export type PhoneOtpPurpose = "signup" | "login";

export type VerifyPhoneCodeResult =
  | { loggedIn: false; phoneVerificationToken: string }
  | { loggedIn: true; user: PublicUser; accessToken: string };

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<AuthResponse, RegisterInput>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        // A rejection here is a *separate* promise chain from the caller's own
        // `.unwrap().catch(...)` — left uncaught, a normal failure (e.g. wrong password, or
        // no session yet on `refresh`) surfaces as an unhandled rejection / page error. This
        // handler's only job is syncing a *successful* result into Redux; failures are the
        // calling component's concern.
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession(data));
        } catch {
          // handled by the caller
        }
      },
    }),

    login: builder.mutation<AuthResponse, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession(data));
        } catch {
          // handled by the caller
        }
      },
    }),

    sendPhoneCode: builder.mutation<void, { phone: string; purpose: PhoneOtpPurpose }>({
      query: (body) => ({ url: "/auth/phone/send-code", method: "POST", body }),
    }),

    // Login-purpose success logs the caller in directly (see VerifyPhoneCodeResult) — the
    // component calling this is responsible for dispatching setSession itself in that case,
    // same pattern as every other mutation here that can conditionally establish a session.
    verifyPhoneCode: builder.mutation<
      VerifyPhoneCodeResult,
      { phone: string; code: string; purpose: PhoneOtpPurpose }
    >({
      query: (body) => ({ url: "/auth/phone/verify-code", method: "POST", body }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          if (data.loggedIn) dispatch(setSession({ user: data.user, accessToken: data.accessToken }));
        } catch {
          // handled by the caller
        }
      },
    }),

    /** Silently re-establishes a session from the httpOnly refresh cookie — used on app load. */
    refresh: builder.mutation<AuthResponse, void>({
      query: () => ({ url: "/auth/refresh", method: "POST" }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession(data));
        } catch {
          // expected for an anonymous visitor — handled by SessionInitializer
        }
      },
    }),

    logout: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
        } finally {
          // Clear client-side session state even if the network call failed — there's no
          // recovery action for the user to take, and staying "authenticated" locally while
          // the server-side call failed would be worse than a false "logged out".
          dispatch(clearSession());
          disconnectSocket();
        }
      },
    }),

    getMe: builder.query<PublicUser, void>({
      query: () => "/auth/me",
    }),

    verifyEmail: builder.mutation<void, { token: string }>({
      query: (body) => ({ url: "/auth/verify-email", method: "POST", body }),
    }),

    resendVerification: builder.mutation<void, { email: string }>({
      query: (body) => ({ url: "/auth/resend-verification", method: "POST", body }),
    }),

    forgotPassword: builder.mutation<void, { email: string }>({
      query: (body) => ({ url: "/auth/forgot-password", method: "POST", body }),
    }),

    resetPassword: builder.mutation<void, { token: string; newPassword: string }>({
      query: (body) => ({ url: "/auth/reset-password", method: "POST", body }),
    }),

    changePassword: builder.mutation<void, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: "/auth/change-password", method: "PATCH", body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useSendPhoneCodeMutation,
  useVerifyPhoneCodeMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
} = authApi;
