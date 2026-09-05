"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useGetMyDeliveriesQuery, useGetMyRiderProfileQuery } from "@/lib/redux/services/riders-api";
import { useListMyRiderPayoutsQuery } from "@/lib/redux/services/payouts-api";
import type { PayoutStatus } from "@/lib/redux/services/payouts-api";
import {
  useListPaystackBanksQuery,
  useResolveRiderPaystackAccountMutation,
  useSetupRiderPaystackPayoutMutation,
  useListFlutterwaveBanksQuery,
  useResolveRiderFlutterwaveAccountMutation,
  useSetupRiderFlutterwavePayoutMutation,
  useSetupRiderStripePayoutMutation,
} from "@/lib/redux/services/payments-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { Order, OrderStatus, Rider } from "@/lib/redux/restaurant-types";

const PAYOUT_STATUS_BADGE_VARIANT: Record<PayoutStatus, BadgeProps["variant"]> = {
  pending: "neutral",
  processing: "info",
  succeeded: "success",
  failed: "danger",
};

const STATUS_BADGE_VARIANT: Record<OrderStatus, BadgeProps["variant"]> = {
  PENDING_PAYMENT: "warning",
  PLACED: "info",
  ACCEPTED_BY_RESTAURANT: "info",
  PREPARING: "info",
  READY_FOR_PICKUP: "primary",
  ASSIGNED_TO_RIDER: "info",
  PICKED_UP: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

function DeliveryRow({ order }: { order: Order }) {
  const tStatus = useTranslations("OrderStatus");
  const locale = useLocale();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text">{order.orderNumber}</span>
        <span className="text-xs text-text-muted">{new Date(order.createdAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text">{formatMoney(order.deliveryFee, order.currency, locale)}</span>
        <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
      </div>
    </div>
  );
}

function DeliveryHistory() {
  const t = useTranslations("RiderDeliveriesPage");
  const locale = useLocale();
  const { data: deliveries, isLoading } = useGetMyDeliveriesQuery();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!deliveries || deliveries.length === 0) {
    return <EmptyState title={t("noDeliveriesYet")} description={t("acceptedOrdersShowUpHere")} />;
  }

  const delivered = deliveries.filter((o) => o.status === "DELIVERED");
  // A rider could in principle deliver for restaurants/stores in different currencies — summing
  // raw amounts across currencies into one number would silently produce a meaningless total, so
  // earnings are grouped by currency and each shown on its own line (almost always just one).
  const earningsByCurrency = delivered.reduce<Record<string, number>>((acc, o) => {
    acc[o.currency] = (acc[o.currency] ?? 0) + o.deliveryFee;
    return acc;
  }, {});
  const earningsEntries = Object.entries(earningsByCurrency);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("totalEarnings")}</span>
            <span className="text-2xl font-bold text-text">
              {earningsEntries.length > 0
                ? earningsEntries.map(([currency, total]) => formatMoney(total, currency, locale)).join(" + ")
                : formatMoney(0, deliveries[0]?.currency, locale)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("completedDeliveries")}</span>
            <span className="text-2xl font-bold text-text">{delivered.length}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          {deliveries.map((order) => (
            <DeliveryRow key={order._id} order={order} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Rider counterpart of the restaurant Earnings page's `PaystackPayoutSetup` (docs/ROADMAP.md
 * FDP-94) — self-service, no currency gate the way restaurant/store onboarding has, since a
 * rider isn't tied to a single seller's currency the way a restaurant/store is. */
function PaystackPayoutSetup() {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const { data: banks, isLoading: banksLoading } = useListPaystackBanksQuery();
  const [resolveAccount, { isLoading: resolving }] = useResolveRiderPaystackAccountMutation();
  const [setupPayout, { isLoading: connecting }] = useSetupRiderPaystackPayoutMutation();

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bankOptions: SelectOption[] = (banks ?? []).map((bank) => ({ value: bank.code, label: bank.name }));

  function resetVerification() {
    setVerifiedName(null);
    setError(null);
  }

  async function handleVerify() {
    setError(null);
    try {
      const result = await resolveAccount({ bankCode, accountNumber }).unwrap();
      setVerifiedName(result.accountName);
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotVerifyAccount")));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ bankCode, accountNumber }).unwrap();
      toast({ title: t("payoutAccountConnected"), variant: "success" });
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotConnectPayoutAccount")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectPaystackAccount")}</CardTitle>
        <CardDescription>{t("addBankDetailsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("bank")} required>
            <Select
              options={bankOptions}
              value={bankCode}
              onChange={(value) => {
                setBankCode(value);
                resetVerification();
              }}
              placeholder={banksLoading ? t("loadingBanks") : t("chooseYourBank")}
              disabled={banksLoading}
              searchable
              searchPlaceholder={t("searchBanks")}
            />
          </FormField>
          <FormField label={t("accountNumber")} required>
            <Input
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value);
                resetVerification();
              }}
              placeholder="0123456789"
              inputMode="numeric"
            />
          </FormField>
        </div>

        {verifiedName ? (
          <Alert variant="success" title={t("accountVerified")}>
            {t("accountVerifiedDescription", { name: verifiedName })}
          </Alert>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            isLoading={resolving}
            disabled={!bankCode || accountNumber.trim().length < 10}
            onClick={() => void handleVerify()}
          >
            {t("verifyAccount")}
          </Button>
        )}

        {verifiedName && (
          <Button size="sm" className="w-fit" isLoading={connecting} onClick={() => void handleConnect()}>
            {t("connectPayoutAccount")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Rider counterpart of the restaurant Earnings page's `FlutterwavePayoutSetup`. */
function FlutterwavePayoutSetup() {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const { data: banks, isLoading: banksLoading } = useListFlutterwaveBanksQuery();
  const [resolveAccount, { isLoading: resolving }] = useResolveRiderFlutterwaveAccountMutation();
  const [setupPayout, { isLoading: connecting }] = useSetupRiderFlutterwavePayoutMutation();

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bankOptions: SelectOption[] = (banks ?? []).map((bank) => ({ value: bank.code, label: bank.name }));

  function resetVerification() {
    setVerifiedName(null);
    setError(null);
  }

  async function handleVerify() {
    setError(null);
    try {
      const result = await resolveAccount({ bankCode, accountNumber }).unwrap();
      setVerifiedName(result.accountName);
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotVerifyAccount")));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ bankCode, accountNumber }).unwrap();
      toast({ title: t("payoutAccountConnected"), variant: "success" });
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotConnectPayoutAccount")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectFlutterwaveAccount")}</CardTitle>
        <CardDescription>{t("addBankDetailsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("bank")} required>
            <Select
              options={bankOptions}
              value={bankCode}
              onChange={(value) => {
                setBankCode(value);
                resetVerification();
              }}
              placeholder={banksLoading ? t("loadingBanks") : t("chooseYourBank")}
              disabled={banksLoading}
              searchable
              searchPlaceholder={t("searchBanks")}
            />
          </FormField>
          <FormField label={t("accountNumber")} required>
            <Input
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value);
                resetVerification();
              }}
              placeholder="0123456789"
              inputMode="numeric"
            />
          </FormField>
        </div>

        {verifiedName ? (
          <Alert variant="success" title={t("accountVerified")}>
            {t("accountVerifiedDescription", { name: verifiedName })}
          </Alert>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            isLoading={resolving}
            disabled={!bankCode || accountNumber.trim().length < 10}
            onClick={() => void handleVerify()}
          >
            {t("verifyAccount")}
          </Button>
        )}

        {verifiedName && (
          <Button size="sm" className="w-fit" isLoading={connecting} onClick={() => void handleConnect()}>
            {t("connectPayoutAccount")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Rider counterpart of the restaurant Earnings page's `StripePayoutSetup`. */
function StripePayoutSetup({ rider }: { rider: Rider }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const [setupPayout, { isLoading }] = useSetupRiderStripePayoutMutation();
  const hasPendingAccount = rider.payoutAccounts.some(
    (account) => account.provider === "stripe" && account.status === "pending",
  );

  async function handleConnect() {
    try {
      const result = await setupPayout().unwrap();
      window.location.href = result.onboardingUrl;
    } catch (err) {
      toast({ title: t("couldNotStartStripeOnboarding"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectStripeAccount")}</CardTitle>
        <CardDescription>{t("stripeDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hasPendingAccount && <Alert variant="warning">{t("stripePendingWarning")}</Alert>}
        <Button size="sm" className="w-fit" isLoading={isLoading} onClick={() => void handleConnect()}>
          {hasPendingAccount ? t("continueOnboarding") : t("connectWithStripe")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Weekly payout execution (docs/ROADMAP.md FDP-92/93/94) — the rider's own `Payout` audit
 * trail, plus onboarding forms (shown until at least one provider is active) so a rider can
 * actually receive the weekly batch — riders keep 100% of their delivery fees (no platform
 * commission on this side). */
function RiderPayoutList() {
  const t = useTranslations("RiderDeliveriesPage");
  const tStatus = useTranslations("PayoutStatus");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListMyRiderPayoutsQuery({ page, limit: 10 });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data || data.items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("payoutHistory")}</CardTitle>
        <CardDescription>{t("payoutHistoryDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.items.map((payout) => (
          <div
            key={payout._id}
            className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text">
                {new Date(payout.createdAt).toLocaleDateString(locale)}
              </span>
              <span className="text-xs text-text-muted">{payout.provider}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-text">
                {formatMoney(payout.grossAmount, payout.currency, locale)}
              </span>
              <Badge variant={PAYOUT_STATUS_BADGE_VARIANT[payout.status]}>
                {tStatus(payout.status)}
              </Badge>
            </div>
          </div>
        ))}
        {data.totalPages > 1 && (
          <div className="pt-4">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiderPayoutHistory() {
  const { data: rider, isLoading } = useGetMyRiderProfileQuery();

  if (isLoading || !rider) return <Skeleton className="h-32 w-full" />;

  const hasAnyActiveAccount = rider.payoutAccounts.some((a) => a.status === "active");

  return (
    <div className="flex flex-col gap-6">
      {!hasAnyActiveAccount && <PaystackPayoutSetup />}
      {!hasAnyActiveAccount && <FlutterwavePayoutSetup />}
      {!hasAnyActiveAccount && <StripePayoutSetup rider={rider} />}

      <RiderPayoutList />
    </div>
  );
}

export default function RiderDeliveriesPage() {
  const t = useTranslations("RiderDeliveriesPage");
  return (
    <RequireRole roles={["rider"]}>
      <Container className="flex flex-col gap-6 py-10">
        <h1 className="text-2xl font-bold text-text">{t("deliveryHistory")}</h1>
        <DeliveryHistory />
        <RiderPayoutHistory />
      </Container>
    </RequireRole>
  );
}
