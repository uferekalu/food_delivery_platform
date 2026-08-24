"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Rating } from "@/components/ui/rating";
import { ImageUpload } from "@/components/ui/image-upload";
import { useToast } from "@/components/ui/toast";
import { useCreateReviewMutation } from "@/lib/redux/services/reviews-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { ReviewTargetType } from "@/lib/redux/restaurant-types";

const schema = z.object({
  rating: z.number().min(1, "Pick a rating").max(5),
  comment: z.string().max(1000).optional(),
});
type FormValues = z.infer<typeof schema>;

export interface ReviewFormProps {
  orderId: string;
  targetType: ReviewTargetType;
  title: string;
}

export function ReviewForm({ orderId, targetType, title }: ReviewFormProps) {
  const { toast } = useToast();
  const [createReview, { isLoading }] = useCreateReviewMutation();
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { rating: 0, comment: "" } });
  const rating = watch("rating");

  async function submit(values: FormValues) {
    try {
      await createReview({
        targetType,
        orderId,
        rating: values.rating,
        comment: values.comment?.trim() || undefined,
        images: imageUrl ? [imageUrl] : undefined,
      }).unwrap();
      toast({ title: "Thanks for your review!", variant: "success" });
    } catch (err) {
      toast({ title: "Couldn't submit your review", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(submit)(e)} className="flex flex-col gap-4" noValidate>
          <FormField label="Rating" error={errors.rating?.message} required>
            <Rating
              label={title}
              value={rating}
              onChange={(v) => setValue("rating", v, { shouldValidate: true })}
              size="lg"
            />
          </FormField>
          <FormField label="Comment (optional)" error={errors.comment?.message}>
            <Textarea
              rows={3}
              placeholder="Share details about your experience"
              onChange={(e) => setValue("comment", e.target.value)}
            />
          </FormField>
          <ImageUpload label="Photo (optional)" folder="reviews" value={imageUrl} onChange={setImageUrl} />
          <Button type="submit" isLoading={isLoading} className="self-start">
            Submit review
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
