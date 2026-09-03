import { api } from "../api";

export type UploadFolder =
  | "restaurants"
  | "menu-items"
  | "avatars"
  | "reviews"
  | "compliance-documents"
  | "rider-documents"
  | "stores"
  | "products";

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export const uploadsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getUploadSignature: builder.query<UploadSignature, UploadFolder>({
      query: (folder) => `/uploads/signature?folder=${folder}`,
    }),
  }),
});

export const { useLazyGetUploadSignatureQuery } = uploadsApi;
