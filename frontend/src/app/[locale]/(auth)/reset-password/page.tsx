"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useResetPasswordMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

const PASSWORD_RULE = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

function ResetPasswordForm() {
  const t = useTranslations("ResetPasswordPage");
  const schema = z
    .object({
      newPassword: z
        .string()
        .min(8, t("atLeast8Chars"))
        .max(72)
        .regex(PASSWORD_RULE, t("passwordComplexity")),
      confirmPassword: z.string(),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t("passwordsDontMatch"),
      path: ["confirmPassword"],
    });
  type Values = z.infer<typeof schema>;
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
      setError(t("missingToken"));
      return;
    }
    setError(null);
    try {
      await resetPassword({ token, newPassword: values.newPassword }).unwrap();
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, t("linkInvalidOrExpired")));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resetPassword")}</CardTitle>
        <CardDescription>{t("chooseNewPassword")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {done ? (
          <Alert variant="success" title={t("passwordUpdated")}>
            {t("signedOutAllDevices")}
          </Alert>
        ) : !token ? (
          <Alert variant="danger">{t("missingToken")}</Alert>
        ) : (
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
            <FormField label={t("newPassword")} error={errors.newPassword?.message} required>
              <Input type="password" autoComplete="new-password" {...register("newPassword")} />
            </FormField>
            <FormField label={t("confirmNewPassword")} error={errors.confirmPassword?.message} required>
              <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
            </FormField>
            <Button type="submit" isLoading={isLoading}>
              {t("resetPassword")}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-text-muted">
          <Link href="/login" className="text-primary hover:underline">
            {t("backToLogIn")}
          </Link>
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
