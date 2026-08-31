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
import { useLoginMutation, useSendPhoneCodeMutation, useVerifyPhoneCodeMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginValues = z.infer<typeof loginSchema>;

function EmailLoginForm() {
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
    <div className="flex flex-col gap-4">
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
    </div>
  );
}

/**
 * Passwordless: proving phone ownership via OTP *is* the credential, matching the backend
 * (docs/ROADMAP.md FDP-41) — only works for a phone already verified during signup or from a
 * verified account; a phone with no verified account gets the same generic response either way
 * (see AuthService.sendPhoneCode), so the failure only ever surfaces at the verify step.
 */
function PhoneLoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendCode, { isLoading: isSending }] = useSendPhoneCodeMutation();
  const [verifyCode, { isLoading: isVerifying }] = useVerifyPhoneCodeMutation();

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await sendCode({ phone, purpose: "login" }).unwrap();
      setCodeSent(true);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't send a code to that number"));
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await verifyCode({ phone, code, purpose: "login" }).unwrap();
      if (result.loggedIn) router.push("/");
    } catch (err) {
      setError(getErrorMessage(err, "That code didn't match"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {!codeSent ? (
        <form onSubmit={(e) => void handleSendCode(e)} className="flex flex-col gap-4" noValidate>
          <FormField label="Phone number" required>
            <Input
              type="tel"
              placeholder="+2348012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </FormField>
          <Button type="submit" isLoading={isSending}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleVerifyCode(e)} className="flex flex-col gap-4" noValidate>
          <FormField label="Verification code" hint={`Sent to ${phone}`} required>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
          <Button type="submit" isLoading={isVerifying}>
            Log in
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCodeSent(false)}>
            Use a different number
          </Button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  const [method, setMethod] = useState<"email" | "phone">("email");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back — enter your details to continue.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {method === "email" ? <EmailLoginForm /> : <PhoneLoginForm />}
        <button
          type="button"
          onClick={() => setMethod(method === "email" ? "phone" : "email")}
          className="text-center text-sm text-primary hover:underline"
        >
          {method === "email" ? "Log in with phone instead" : "Log in with email instead"}
        </button>
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
