import { api } from "../api";
import type { PaginatedResult, Review, ReviewTargetType } from "../restaurant-types";

export interface CreateReviewInput {
  targetType: ReviewTargetType;
  orderId: string;
  rating: number;
  comment?: string;
  images?: string[];
}

export interface ListReviewsParams {
  targetType: ReviewTargetType;
  targetId: string;
  page?: number;
  limit?: number;
}

export interface ReviewEligibility {
  restaurant: boolean;
  rider: boolean;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return `?${search.toString()}`;
}

export const reviewsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    createReview: builder.mutation<Review, CreateReviewInput>({
      query: (body) => ({ url: "/reviews", method: "POST", body }),
      invalidatesTags: (_result, _error, { targetType, orderId }) => [
        { type: "Review" as const, id: `LIST-${targetType}` },
        { type: "Review" as const, id: `ELIGIBILITY-${orderId}` },
      ],
    }),

    listReviews: builder.query<PaginatedResult<Review>, ListReviewsParams>({
      query: ({ targetType, targetId, page, limit }) =>
        `/reviews${toQueryString({ targetType, targetId, page, limit })}`,
      providesTags: (_result, _error, { targetType }) => [{ type: "Review", id: `LIST-${targetType}` }],
    }),

    getReviewEligibility: builder.query<ReviewEligibility, string>({
      query: (orderId) => `/reviews/eligibility/${orderId}`,
      providesTags: (_result, _error, orderId) => [{ type: "Review", id: `ELIGIBILITY-${orderId}` }],
    }),
  }),
});

export const { useCreateReviewMutation, useListReviewsQuery, useGetReviewEligibilityQuery } = reviewsApi;
