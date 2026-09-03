"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter as usePlainRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useRouter } from "@/i18n/navigation";
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
import type { StoreType } from "@/lib/redux/restaurant-types";

interface VerifiedPhone {
  phone: string;
  token: string;
}

// What the person is actually signing up to do — a strict superset of the backend's
// SelfRegisterableRole. Store ownership reuses the restaurant_owner role (docs/ROADMAP.md
// FDP-56's architecture decision), so "groceries"/"pharmacy_beauty" both map to that same role;
// this finer-grained client-only choice only decides which dashboard the person lands in right
// after registering (and, via the `type` query param, lets a link pre-select one for them).
type AccountChoice = "customer" | "restaurant" | StoreType;

function roleForAccountChoice(choice: AccountChoice): SelfRegisterableRole {
  return choice === "customer" ? "customer" : "restaurant_owner";
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
  const t = useTranslations("RegisterPage");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendCode, { isLoading: isSending }] = useSendPhoneCodeMutation();
  const [verifyCode, { isLoading: isVerifying }] = useVerifyPhoneCodeMutation();

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border p-3">
        <Badge variant="success">{t("verified")}</Badge>
        <span className="flex-1 text-sm text-text">{verified.phone}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          {t("change")}
        </Button>
      </div>
    );
  }

  async function handleSendCode() {
    setError(null);
    try {
      const result = await sendCode({ phone, purpose: "signup" }).unwrap();
      if (result.sent) {
        setCodeSent(true);
      } else {
        setError(t("couldNotSendCode"));
      }
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotSendCode")));
    }
  }

  async function handleVerifyCode() {
    setError(null);
    try {
      const result = await verifyCode({ phone, code, purpose: "signup" }).unwrap();
      if (!result.loggedIn) onVerified({ phone, token: result.phoneVerificationToken });
    } catch (err) {
      setError(getErrorMessage(err, t("codeDidNotMatch")));
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
              aria-label={t("phoneNumber")}
            />
          </div>
          <Button type="button" variant="outline" isLoading={isSending} onClick={() => void handleSendCode()}>
            {t("sendCode")}
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              type="text"
              inputMode="numeric"
              placeholder={t("sixDigitCode")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label={t("verificationCode")}
            />
          </div>
          <Button type="button" variant="outline" isLoading={isVerifying} onClick={() => void handleVerifyCode()}>
            {t("verify")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCodeSent(false)}>
            {t("back")}
          </Button>
        </div>
      )}
    </div>
  );
}

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

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
  const t = useTranslations("RegisterPage");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createAccount")}</CardTitle>
        <CardDescription>{t("orderInMinutes")}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center py-12">
        <Spinner />
      </CardContent>
    </Card>
  );
}

function RegisterForm() {
  const t = useTranslations("RegisterPage");
  const router = useRouter();
  // A restaurant owner is redirected to /dashboard/restaurants/new, which deliberately isn't
  // under app/[locale] yet (docs/ROADMAP.md FDP-55/FDP-70) — the locale-aware router above would
  // incorrectly prefix that path with the current locale, a URL that doesn't exist. This plain
  // router is used only for that one out-of-scope destination.
  const plainRouter = usePlainRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [registerUser, { isLoading }] = useRegisterMutation();
  const [error, setError] = useState<string | null>(null);
  // Lets a link preselect the right account type instead of dropping everyone into the generic
  // customer default: the footer/homepage's existing "Partner with us" links
  // (`/register?role=restaurant_owner`) still preselect "restaurant", while a newer `?type=`
  // param (`groceries`/`pharmacy_beauty`/`restaurant`) lets a more specific CTA — e.g. "Sell
  // groceries or pharmacy items" — preselect one of those instead.
  const typeParam = searchParams.get("type");
  const initialAccountChoice: AccountChoice =
    typeParam === "groceries" || typeParam === "pharmacy_beauty" || typeParam === "restaurant"
      ? typeParam
      : searchParams.get("role") === "restaurant_owner"
        ? "restaurant"
        : "customer";
  const [accountChoice, setAccountChoice] = useState<AccountChoice>(initialAccountChoice);
  const [verifiedPhone, setVerifiedPhone] = useState<VerifiedPhone | null>(null);
  const registerSchema = z
    .object({
      name: z.string().min(2, t("enterFullName")).max(100),
      email: z.string().email(t("enterValidEmail")),
      password: z
        .string()
        .min(8, t("atLeast8Chars"))
        .max(72)
        .regex(PASSWORD_RULE, t("passwordComplexity")),
      confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("passwordsDontMatch"),
      path: ["confirmPassword"],
    });
  type RegisterValues = z.infer<typeof registerSchema>;
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
        role: roleForAccountChoice(accountChoice),
        ...(verifiedPhone ? { phone: verifiedPhone.phone, phoneVerificationToken: verifiedPhone.token } : {}),
      }).unwrap();
      toast({
        title: t("accountCreated"),
        description:
          accountChoice === "restaurant"
            ? t("checkEmailRestaurantOwner")
            : accountChoice === "customer"
              ? t("checkEmail")
              : t("checkEmailStoreOwner"),
        variant: "success",
      });
      if (accountChoice === "restaurant") {
        plainRouter.push("/dashboard/restaurants/new");
      } else if (accountChoice === "groceries" || accountChoice === "pharmacy_beauty") {
        plainRouter.push(`/dashboard/stores/new?type=${accountChoice}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotCreateAccount")));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createAccount")}</CardTitle>
        <CardDescription>{t("orderInMinutes")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
          <RadioGroup
            label={t("accountType")}
            value={accountChoice}
            onChange={(value) => setAccountChoice(value as AccountChoice)}
          >
            <RadioOption value="customer" label={t("orderingFood")} />
            <RadioOption value="restaurant" label={t("runARestaurant")} description={t("addManageRestaurant")} />
            <RadioOption value="groceries" label={t("runAGroceryStore")} description={t("addManageGroceryStore")} />
            <RadioOption
              value="pharmacy_beauty"
              label={t("runAPharmacyStore")}
              description={t("addManagePharmacyStore")}
            />
          </RadioGroup>
          <FormField label={t("fullName")} error={errors.name?.message} required>
            <Input autoComplete="name" {...register("name")} />
          </FormField>
          <FormField label={t("email")} error={errors.email?.message} required>
            <Input type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <FormField
            label={t("password")}
            error={errors.password?.message}
            hint={!errors.password ? t("passwordHint") : undefined}
            required
          >
            <Input type="password" autoComplete="new-password" {...register("password")} />
          </FormField>
          <FormField label={t("confirmPassword")} error={errors.confirmPassword?.message} required>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </FormField>
          <FormField label={t("phoneNumberOptional")} hint={t("verifyPhoneHint")}>
            <PhoneVerificationField
              verified={verifiedPhone}
              onVerified={setVerifiedPhone}
              onClear={() => setVerifiedPhone(null)}
            />
          </FormField>
          <Button type="submit" isLoading={isLoading}>
            {t("createAccountButton")}
          </Button>
        </form>
        <p className="text-center text-sm text-text-muted">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("logIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
