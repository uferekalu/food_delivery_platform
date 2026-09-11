"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  useInitiateAdCampaignPaymentMutation,
  useListMyAdCampaignsQuery,
} from "@/lib/redux/services/ad-campaigns-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { AdCampaign, AdCampaignStatus } from "@/lib/redux/restaurant-types";

const STATUS_BADGE_VARIANT: Record<AdCampaignStatus, "warning" | "info" | "success" | "neutral" | "danger"> = {
  pending_payment: "warning",
  scheduled: "info",
  active: "success",
  ended: "neutral",
  cancelled: "danger",
};

function TagIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0">
      <path
        d="M10.5 3H4a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .29.71l7.5 7.5a1 1 0 0 0 1.42 0l6.5-6.5a1 1 0 0 0 0-1.42l-7.5-7.5A1 1 0 0 0 10.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.25" fill="currentColor" />
    </svg>
  );
}

function CampaignCard({ campaign }: { campaign: AdCampaign }) {
  const t = useTranslations("VendorAdCampaignsPage");
  const locale = useLocale();
  const { toast } = useToast();
  const [initiatePayment, { isLoading }] = useInitiateAdCampaignPaymentMutation();

  async function payNow() {
    try {
      const { redirectUrl } = await initiatePayment({ id: campaign._id }).unwrap();
      window.location.href = redirectUrl;
    } catch (err) {
      toast({ title: t("couldNotStartPayment"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  const isLive = campaign.status === "active";

  return (
    <Card className={isLive ? "overflow-hidden border-success/40" : "overflow-hidden"}>
      {isLive && (
        <div className="flex items-center gap-2 bg-success-bg px-4 py-2 text-sm font-medium text-success">
          <span className="flex size-5 items-center justify-center rounded-full bg-success text-neutral-0">
            <TagIcon />
          </span>
          {t("liveBanner")}
        </div>
      )}
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>{t(`status_${campaign.status}`)}</Badge>
            {campaign.paymentStatus === "failed" && <Badge variant="danger">{t("paymentFailed")}</Badge>}
          </div>
          <span className="text-sm text-text-muted">
            {t("dateRange", {
              start: new Date(campaign.startDate).toLocaleDateString(locale),
              end: new Date(campaign.endDate).toLocaleDateString(locale),
            })}
            {" · "}
            {formatMoney(campaign.totalPrice, campaign.currency, locale)}
          </span>
          {campaign.status === "pending_payment" && (
            <span className="text-xs text-text-muted">{t("payToActivate")}</span>
          )}
          {campaign.cancelReason && (
            <span className="text-xs text-text-muted">{t("cancelReasonLabel", { reason: campaign.cancelReason })}</span>
          )}
        </div>
        {campaign.status === "pending_payment" && (
          <Button isLoading={isLoading} onClick={() => void payNow()}>
            {t("payNow")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function VendorAdCampaignsManager({
  vendorType,
  vendorId,
}: {
  vendorType: "restaurant" | "store";
  vendorId: string;
}) {
  const t = useTranslations("VendorAdCampaignsPage");
  const { data: allMine, isLoading } = useListMyAdCampaignsQuery();
  const campaigns = (allMine ?? []).filter((c) =>
    vendorType === "restaurant" ? c.restaurantId === vendorId : c.storeId === vendorId,
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted">{t("description")}</p>
      {campaigns.length === 0 ? (
        <EmptyState title={t("noCampaignsYet")} description={t("adminCreatesDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign._id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
