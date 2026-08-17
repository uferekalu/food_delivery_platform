import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PublicUser } from "../types";

export type AuthStatus = "idle" | "authenticated" | "unauthenticated";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  status: AuthStatus;
}

const initialState: AuthState = { user: null, accessToken: null, status: "idle" };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<{ user: PublicUser; accessToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = "authenticated";
    },
    setCurrentUser(state, action: PayloadAction<PublicUser>) {
      state.user = action.payload;
    },
    clearSession(state) {
      state.user = null;
      state.accessToken = null;
      state.status = "unauthenticated";
    },
  },
});

export const { setSession, setCurrentUser, clearSession } = authSlice.actions;
export default authSlice.reducer;
