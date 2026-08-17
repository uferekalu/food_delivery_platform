"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import NextLink from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useForgotPasswordMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      await forgotPassword(values).unwrap();
      // Always shown on success, regardless of whether the email exists — the backend
      // deliberately never reveals account existence here, see docs/ARCHITECTURE.md §11.
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>We&apos;ll email you a link to reset it.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {sent ? (
          <Alert variant="success" title="Check your email">
            If an account exists for that address, we&apos;ve sent a link to reset your password.
          </Alert>
        ) : (
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
            <FormField label="Email" error={errors.email?.message} required>
              <Input type="email" autoComplete="email" {...register("email")} />
            </FormField>
            <Button type="submit" isLoading={isLoading}>
              Send reset link
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
