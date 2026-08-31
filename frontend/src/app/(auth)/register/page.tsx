"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import NextLink from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { RadioGroup, RadioOption } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  useRegisterMutation,
  useSendPhoneCodeMutation,
  useVerifyPhoneCodeMutation,
} from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { SelfRegisterableRole } from "@/lib/constants/roles";

interface VerifiedPhone {
  phone: string;
  token: string;
}

/**
 * Self-contained phone verification widget for signup (docs/ROADMAP.md FDP-41) — send a code,
 * enter it, and on success this hands the parent a `phoneVerificationToken` proving the phone
 * was actually checked via OTP, not just typed in. The parent carries that token into the final
 * `register()` call; nothing here creates an account by itself.
 */
function PhoneVerificationField({
  verified,
  onVerified,
  onClear,
}: {
  verified: VerifiedPhone | null;
  onVerified: (value: VerifiedPhone) => void;
  onClear: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendCode, { isLoading: isSending }] = useSendPhoneCodeMutation();
  const [verifyCode, { isLoading: isVerifying }] = useVerifyPhoneCodeMutation();

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border p-3">
        <Badge variant="success">Verified</Badge>
        <span className="flex-1 text-sm text-text">{verified.phone}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Change
        </Button>
      </div>
    );
  }

  async function handleSendCode() {
    setError(null);
    try {
      await sendCode({ phone, purpose: "signup" }).unwrap();
      setCodeSent(true);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't send a code to that number"));
    }
  }

  async function handleVerifyCode() {
    setError(null);
    try {
      const result = await verifyCode({ phone, code, purpose: "signup" }).unwrap();
      if (!result.loggedIn) onVerified({ phone, token: result.phoneVerificationToken });
    } catch (err) {
      setError(getErrorMessage(err, "That code didn't match"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!codeSent ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              type="tel"
              placeholder="+2348012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="Phone number"
            />
          </div>
          <Button type="button" variant="outline" isLoading={isSending} onClick={() => void handleSendCode()}>
            Send code
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Verification code"
            />
          </div>
          <Button type="button" variant="outline" isLoading={isVerifying} onClick={() => void handleVerifyCode()}>
            Verify
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCodeSent(false)}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

const registerSchema = z
  .object({
    name: z.string().min(2, "Enter your full name").max(100),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .max(72)
      .regex(PASSWORD_RULE, "Include an uppercase letter, a lowercase letter, and a number"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type RegisterValues = z.infer<typeof registerSchema>;

/**
 * `useSearchParams()` opts the tree above it out of static prerendering unless wrapped in
 * `Suspense` (Next.js would otherwise fail the build with "URL data in a Client Component
 * outside of Suspense") — the actual form lives in `RegisterForm` below so only that part
 * bails out to client rendering, not the whole page.
 */
export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterFormSkeleton />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterFormSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Order from your favorite restaurants in minutes.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center py-12">
        <Spinner />
      </CardContent>
    </Card>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [registerUser, { isLoading }] = useRegisterMutation();
  const [error, setError] = useState<string | null>(null);
  // Lets the footer's "Partner with us" link (`/register?role=restaurant_owner`) preselect the
  // right account type instead of dropping restaurant owners into the generic customer default.
  const [role, setRole] = useState<SelfRegisterableRole>(
    searchParams.get("role") === "restaurant_owner" ? "restaurant_owner" : "customer",
  );
  const [verifiedPhone, setVerifiedPhone] = useState<VerifiedPhone | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterValues) => {
    setError(null);
    try {
      // The backend's ValidationPipe uses forbidNonWhitelisted — confirmPassword is a
      // client-only field, sending it would get the whole request rejected as 400.
      await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
        role,
        ...(verifiedPhone ? { phone: verifiedPhone.phone, phoneVerificationToken: verifiedPhone.token } : {}),
      }).unwrap();
      toast({
        title: "Account created",
        description:
          role === "restaurant_owner"
            ? "Check your email to verify your address, then add your restaurant."
            : "Check your email to verify your address.",
        variant: "success",
      });
      router.push(role === "restaurant_owner" ? "/dashboard/restaurants/new" : "/");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create your account"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Order from your favorite restaurants in minutes.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
          <RadioGroup label="Account type" value={role} onChange={(value) => setRole(value as SelfRegisterableRole)}>
            <RadioOption value="customer" label="I'm ordering food" />
            <RadioOption value="restaurant_owner" label="I run a restaurant" description="Add and manage your restaurant on the platform" />
          </RadioGroup>
          <FormField label="Full name" error={errors.name?.message} required>
            <Input autoComplete="name" {...register("name")} />
          </FormField>
          <FormField label="Email" error={errors.email?.message} required>
            <Input type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <FormField
            label="Password"
            error={errors.password?.message}
            hint={!errors.password ? "At least 8 characters, with upper/lowercase letters and a number" : undefined}
            required
          >
            <Input type="password" autoComplete="new-password" {...register("password")} />
          </FormField>
          <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </FormField>
          <FormField label="Phone number (optional)" hint="Verify it now to log in with your phone later.">
            <PhoneVerificationField
              verified={verifiedPhone}
              onVerified={setVerifiedPhone}
              onClear={() => setVerifiedPhone(null)}
            />
          </FormField>
          <Button type="submit" isLoading={isLoading}>
            Create account
          </Button>
        </form>
        <p className="text-center text-sm text-text-muted">
          Already have an account?{" "}
          <NextLink href="/login" className="text-primary hover:underline">
            Log in
          </NextLink>
        </p>
      </CardContent>
    </Card>
  );
}
