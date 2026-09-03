"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { useExchangeOAuthCodeMutation } from "@/lib/redux/services/auth-api";
import { getErrorMessage } from "@/lib/redux/error";

/**
 * Landing page for GET /auth/google/callback's redirect (docs/ROADMAP.md FDP-42) — the `code`
 * here is a short-lived, single-purpose exchange token, never the real session tokens
 * themselves (see OAuthExchangeTokenPayload's doc comment for why). Redeeming it through the
 * frontend's own /api/* proxy is what makes the resulting refresh cookie first-party.
 */
function OAuthCallbackContent() {
  const t = useTranslations("OAuthCallbackPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const [exchangeCode] = useExchangeOAuthCodeMutation();
  // Missing-code is a pure function of the URL, known at render time — it's never set from the
  // effect below, only the genuinely-async exchange-failure case is.
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !code) return;
    attempted.current = true;

    exchangeCode({ code })
      .unwrap()
      .then(() => router.replace("/"))
      .catch((err: unknown) => setExchangeError(getErrorMessage(err, t("couldNotCompleteSignIn"))));
  }, [code, exchangeCode, router, t]);

  const error = code ? exchangeError : t("missingSignInCode");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("signingYouIn")}</CardTitle>
        <CardDescription>{t("shouldOnlyTakeAMoment")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 py-8">
        {error ? (
          <>
            <Alert variant="danger">{error}</Alert>
            <Link href="/login" className={buttonVariants({ variant: "primary" })}>
              {t("backToLogIn")}
            </Link>
          </>
        ) : (
          <Spinner size="lg" label={t("signingYouIn")} />
        )}
      </CardContent>
    </Card>
  );
}

export default function OAuthCallbackPage() {
  const t = useTranslations("OAuthCallbackPage");
  return (
    <Container className="max-w-lg py-10">
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Spinner size="lg" label={t("loading")} />
          </div>
        }
      >
        <OAuthCallbackContent />
      </Suspense>
    </Container>
  );
}
