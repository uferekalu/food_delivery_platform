"use client";

import { Suspense, use, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  useGetAdCampaignQuery,
  useVerifyAdCampaignPaymentMutation,
} from "@/lib/redux/services/ad-campaigns-api";
import { getErrorMessage } from "@/lib/redux/error";

/** Polling fallback in case the webhook lands slightly after the redirect back — same reasoning
 * and interval as checkout/callback/page.tsx. There's no realtime gateway event for ad
 * campaigns (unlike orders), so this poll plus the active verifyNow() below is the whole story,
 * not just a fallback alongside a socket subscription. */
const POLL_INTERVAL_MS = 3000;

function CallbackContent({ campaignId }: { campaignId: string }) {
  const t = useTranslations("AdCampaignCallbackPage");
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled") === "true";
  const [verifyPayment] = useVerifyAdCampaignPaymentMutation();
  const verifyAttempted = useRef(false);

  const { data: campaign, error, refetch } = useGetAdCampaignQuery(campaignId, {
    pollingInterval: cancelled ? 0 : POLL_INTERVAL_MS,
  });
  const showRetry = cancelled || campaign?.paymentStatus === "failed";
  const isResolved = campaign && campaign.status !== "pending_payment";

  const verifyNow = useCallback(() => {
    verifyPayment(campaignId)
      .unwrap()
      .then(() => refetch())
      .catch(() => {
        // Swallow — the passive poll still covers it; a transient verify failure isn't worth
        // surfacing here, same reasoning as the order checkout callback.
      });
  }, [campaignId, verifyPayment, refetch]);

  useEffect(() => {
    if (cancelled || verifyAttempted.current) return;
    verifyAttempted.current = true;
    verifyNow();
  }, [cancelled, verifyNow]);

  if (error) {
    return <Alert variant="danger">{getErrorMessage(error, t("couldNotLoadCampaign"))}</Alert>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {showRetry ? t("paymentNotCompleted") : isResolved ? t("campaignActivated") : t("confirmingPayment")}
        </CardTitle>
        <CardDescription>
          {showRetry ? t("paymentCancelledOrFailed") : isResolved ? t("campaignActivatedDescription") : t("usuallyTakesAFewSeconds")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 py-6">
        {showRetry || isResolved ? (
          <Link
            href={
              campaign?.restaurantId
                ? `/dashboard/restaurants/${campaign.restaurantId}/advertise`
                : campaign?.storeId
                  ? `/dashboard/stores/${campaign.storeId}/advertise`
                  : "/dashboard/restaurants"
            }
            className={buttonVariants({ variant: "primary" })}
          >
            {t("backToMyCampaigns")}
          </Link>
        ) : (
          <>
            <Spinner size="lg" label={t("confirmingPaymentLabel")} />
            <Button variant="ghost" size="sm" onClick={verifyNow}>
              {t("checkAgain")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdCampaignCallbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("AdCampaignCallbackPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-lg py-10">
        <Suspense
          fallback={
            <div className="flex justify-center py-24">
              <Spinner size="lg" label={t("loading")} />
            </div>
          }
        >
          <CallbackContent campaignId={id} />
        </Suspense>
      </Container>
    </RequireRole>
  );
}
