import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import themeReducer from "./slices/theme-slice";
import authReducer from "./slices/auth-slice";

export const makeStore = () =>
  configureStore({
    reducer: {
      theme: themeReducer,
      auth: authReducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
