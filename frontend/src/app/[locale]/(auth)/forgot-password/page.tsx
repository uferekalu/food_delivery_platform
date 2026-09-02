"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useForgotPasswordMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

export default function ForgotPasswordPage() {
  const t = useTranslations("ForgotPasswordPage");
  const schema = z.object({ email: z.string().email(t("enterValidEmail")) });
  type Values = z.infer<typeof schema>;
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
        <CardTitle>{t("forgotPassword")}</CardTitle>
        <CardDescription>{t("weWillEmailLink")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {sent ? (
          <Alert variant="success" title={t("checkYourEmail")}>
            {t("sentLinkIfExists")}
          </Alert>
        ) : (
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4" noValidate>
            <FormField label={t("email")} error={errors.email?.message} required>
              <Input type="email" autoComplete="email" {...register("email")} />
            </FormField>
            <Button type="submit" isLoading={isLoading}>
              {t("sendResetLink")}
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
