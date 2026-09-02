"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLoginMutation, useSendPhoneCodeMutation, useVerifyPhoneCodeMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 shrink-0" fill="#1877F2">
      <path d="M18 9a9 9 0 1 0-10.4 8.89v-6.29H5.31V9h2.29V7.02c0-2.26 1.35-3.51 3.41-3.51.99 0 2.02.18 2.02.18v2.22h-1.14c-1.12 0-1.47.7-1.47 1.42V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9z" />
    </svg>
  );
}

function EmailLoginForm() {
  const t = useTranslations("LoginPage");
  const router = useRouter();
  const [login, { isLoading }] = useLoginMutation();
  const [error, setError] = useState<string | null>(null);
  const loginSchema = z.object({
    email: z.string().email(t("enterValidEmail")),
    password: z.string().min(1, t("passwordRequired")),
  });
  type LoginValues = z.infer<typeof loginSchema>;
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
      setError(getErrorMessage(err, t("invalidCredentials")));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
        <FormField label={t("email")} error={errors.email?.message} required>
          <Input type="email" autoComplete="email" {...register("email")} />
        </FormField>
        <FormField label={t("password")} error={errors.password?.message} required>
          <Input type="password" autoComplete="current-password" {...register("password")} />
        </FormField>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            {t("forgotPassword")}
          </Link>
        </div>
        <Button type="submit" isLoading={isLoading}>
          {t("logIn")}
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
  const t = useTranslations("LoginPage");
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
      setError(getErrorMessage(err, t("couldNotSendCode")));
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await verifyCode({ phone, code, purpose: "login" }).unwrap();
      if (result.loggedIn) router.push("/");
    } catch (err) {
      setError(getErrorMessage(err, t("codeDidNotMatch")));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {!codeSent ? (
        <form onSubmit={(e) => void handleSendCode(e)} className="flex flex-col gap-4" noValidate>
          <FormField label={t("phoneNumber")} required>
            <Input
              type="tel"
              placeholder="+2348012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </FormField>
          <Button type="submit" isLoading={isSending}>
            {t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleVerifyCode(e)} className="flex flex-col gap-4" noValidate>
          <FormField label={t("verificationCode")} hint={t("sentTo", { phone })} required>
            <Input
              type="text"
              inputMode="numeric"
              placeholder={t("sixDigitCode")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
          <Button type="submit" isLoading={isVerifying}>
            {t("logIn")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCodeSent(false)}>
            {t("useDifferentNumber")}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations("LoginPage");
  const [method, setMethod] = useState<"email" | "phone">("email");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("logIn")}</CardTitle>
        <CardDescription>{t("welcomeBack")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {method === "email" ? <EmailLoginForm /> : <PhoneLoginForm />}
        <button
          type="button"
          onClick={() => setMethod(method === "email" ? "phone" : "email")}
          className="text-center text-sm text-primary hover:underline"
        >
          {method === "email" ? t("logInWithPhoneInstead") : t("logInWithEmailInstead")}
        </button>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-muted uppercase">{t("or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {/*
          Plain <a> tags, not the locale-aware Link — these have to be real, un-intercepted
          browser navigations (they go through the frontend's own /api/:path* rewrite to the
          backend, which redirects on to the provider's consent screen), not client-side routing.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/auth/google" className={buttonVariants({ variant: "outline", className: "gap-2" })}>
          <GoogleIcon />
          {t("continueWithGoogle")}
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/auth/facebook" className={buttonVariants({ variant: "outline", className: "gap-2" })}>
          <FacebookIcon />
          {t("continueWithFacebook")}
        </a>
        <p className="text-center text-sm text-text-muted">
          {t("noAccount")}{" "}
          <Link href="/register" className="text-primary hover:underline">
            {t("signUp")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
