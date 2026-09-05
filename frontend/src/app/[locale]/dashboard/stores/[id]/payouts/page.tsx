"use client";

import { use, useState } from "react";
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
import { useGetMyStoresQuery } from "@/lib/redux/services/stores-api";
import { useListStorePayoutsQuery } from "@/lib/redux/services/payouts-api";
import type { PayoutStatus } from "@/lib/redux/services/payouts-api";
import {
  useGetPaymentProvidersQuery,
  useListPaystackBanksQuery,
  useResolveStorePaystackAccountMutation,
  useSetupStorePaystackPayoutMutation,
  useListFlutterwaveBanksQuery,
  useResolveStoreFlutterwaveAccountMutation,
  useSetupStoreFlutterwavePayoutMutation,
  useSetupStoreStripePayoutMutation,
} from "@/lib/redux/services/payments-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { Store } from "@/lib/redux/restaurant-types";

const PAYOUT_STATUS_BADGE_VARIANT: Record<PayoutStatus, BadgeProps["variant"]> = {
  pending: "neutral",
  processing: "info",
  succeeded: "success",
  failed: "danger",
};

/** Store counterpart of the restaurant Earnings page's `PaystackPayoutSetup` (docs/ROADMAP.md
 * FDP-94) — identical shape, scoped to a store instead. */
function PaystackPayoutSetup({ storeId }: { storeId: string }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const { data: banks, isLoading: banksLoading } = useListPaystackBanksQuery();
  const [resolveAccount, { isLoading: resolving }] = useResolveStorePaystackAccountMutation();
  const [setupPayout, { isLoading: connecting }] = useSetupStorePaystackPayoutMutation();

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
      const result = await resolveAccount({ storeId, bankCode, accountNumber }).unwrap();
      setVerifiedName(result.accountName);
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotVerifyAccount")));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ storeId, bankCode, accountNumber }).unwrap();
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

/** Store counterpart of the restaurant Earnings page's `FlutterwavePayoutSetup`. */
function FlutterwavePayoutSetup({ storeId }: { storeId: string }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const { data: banks, isLoading: banksLoading } = useListFlutterwaveBanksQuery();
  const [resolveAccount, { isLoading: resolving }] = useResolveStoreFlutterwaveAccountMutation();
  const [setupPayout, { isLoading: connecting }] = useSetupStoreFlutterwavePayoutMutation();

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
      const result = await resolveAccount({ storeId, bankCode, accountNumber }).unwrap();
      setVerifiedName(result.accountName);
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotVerifyAccount")));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ storeId, bankCode, accountNumber }).unwrap();
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

/** Store counterpart of the restaurant Earnings page's `StripePayoutSetup`. */
function StripePayoutSetup({ store }: { store: Store }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const [setupPayout, { isLoading }] = useSetupStoreStripePayoutMutation();
  const hasPendingAccount = store.payoutAccounts.some(
    (account) => account.provider === "stripe" && account.status === "pending",
  );

  async function handleConnect() {
    try {
      const result = await setupPayout(store._id).unwrap();
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

function StorePayoutHistory({ storeId }: { storeId: string }) {
  const t = useTranslations("StorePayoutsPage");
  const tStatus = useTranslations("PayoutStatus");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListStorePayoutsQuery({ storeId, page, limit: 10 });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data || data.items.length === 0) {
    return <EmptyState title={t("noPayoutsYet")} description={t("payoutsAppearHere")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
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
        </CardContent>
      </Card>
      {data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      )}
    </div>
  );
}

function StorePayoutsManager({ store }: { store: Store }) {
  const { data: providers } = useGetPaymentProvidersQuery(store.currency);
  const paystackAvailable = providers?.includes("paystack") ?? false;
  const flutterwaveAvailable = providers?.includes("flutterwave") ?? false;
  const stripeAvailable = providers?.includes("stripe") ?? false;

  const hasAnyActiveAccount = store.payoutAccounts.some((a) => a.status === "active");

  return (
    <div className="flex flex-col gap-6">
      {!hasAnyActiveAccount && paystackAvailable && <PaystackPayoutSetup storeId={store._id} />}
      {!hasAnyActiveAccount && flutterwaveAvailable && <FlutterwavePayoutSetup storeId={store._id} />}
      {!hasAnyActiveAccount && stripeAvailable && <StripePayoutSetup store={store} />}

      <StorePayoutHistory storeId={store._id} />
    </div>
  );
}

export default function StorePayoutsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("StorePayoutsPage");
  const { data: stores, isLoading } = useGetMyStoresQuery();
  const store = stores?.find((s) => s._id === id);

  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-2xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("payouts")}</h1>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !store ? (
          <Alert variant="danger">{t("storeNotFound")}</Alert>
        ) : (
          <StorePayoutsManager store={store} />
        )}
      </Container>
    </RequireRole>
  );
}
