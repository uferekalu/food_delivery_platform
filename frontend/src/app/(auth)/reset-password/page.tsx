"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import NextLink from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useResetPasswordMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, "At least 8 characters")
      .max(72)
      .regex(PASSWORD_RULE, "Include an uppercase letter, a lowercase letter, and a number"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type Values = z.infer<typeof schema>;

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [resetPassword, { isLoading }] = useResetPasswordMutation();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    if (!token) {
      setError("This reset link is missing its token — request a new one.");
      return;
    }
    setError(null);
    try {
      await resetPassword({ token, newPassword: values.newPassword }).unwrap();
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, "This reset link is invalid or has expired"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {done ? (
          <Alert variant="success" title="Password updated">
            You&apos;ve been signed out of all devices for security — log in with your new password.
          </Alert>
        ) : !token ? (
          <Alert variant="danger">This reset link is missing its token — request a new one.</Alert>
        ) : (
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
            <FormField label="New password" error={errors.newPassword?.message} required>
              <Input type="password" autoComplete="new-password" {...register("newPassword")} />
            </FormField>
            <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
              <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
            </FormField>
            <Button type="submit" isLoading={isLoading}>
              Reset password
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-text-muted">
          <NextLink href="/login" className="text-primary hover:underline">
            Back to log in
          </NextLink>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
