"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import NextLink from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLoginMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [login, { isLoading }] = useLoginMutation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginValues) => {
    setError(null);
    try {
      await login(values).unwrap();
      router.push("/");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid email or password"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back — enter your details to continue.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
          <FormField label="Email" error={errors.email?.message} required>
            <Input type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <FormField label="Password" error={errors.password?.message} required>
            <Input type="password" autoComplete="current-password" {...register("password")} />
          </FormField>
          <div className="flex justify-end">
            <NextLink href="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </NextLink>
          </div>
          <Button type="submit" isLoading={isLoading}>
            Log in
          </Button>
        </form>
        <p className="text-center text-sm text-text-muted">
          Don&apos;t have an account?{" "}
          <NextLink href="/register" className="text-primary hover:underline">
            Sign up
          </NextLink>
        </p>
      </CardContent>
    </Card>
  );
}
