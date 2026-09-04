"use client";

import { use, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useGetMyRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useGetRestaurantEarningsQuery } from "@/lib/redux/services/orders-api";
import {
  useGetPaymentProvidersQuery,
  useListPaystackBanksQuery,
  useResolvePaystackAccountMutation,
  useSetupPaystackPayoutMutation,
  useListFlutterwaveBanksQuery,
  useResolveFlutterwaveAccountMutation,
  useSetupFlutterwavePayoutMutation,
  useSetupStripePayoutMutation,
} from "@/lib/redux/services/payments-api";
import { getErrorMessage } from "@/lib/redux/error";
import { formatMoney } from "@/lib/currency";
import type { Restaurant } from "@/lib/redux/restaurant-types";

function EarningsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-2xl font-bold text-text">{value}</span>
    </div>
  );
}

/**
 * Vendor payouts epic, part 2 of 4 (docs/ROADMAP.md FDP-52) — gated on the restaurant's currency
 * actually supporting Paystack (checked via the existing /payments/providers endpoint) rather
 * than showing a setup form that would just fail, e.g. for a USD-only restaurant waiting on
 * FDP-54's Stripe Connect. Flutterwave's equivalent (FDP-53) is the FlutterwavePayoutSetup
 * component below — both can render together for a currency that supports both providers.
 */
function PaystackPayoutSetup({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const { data: banks, isLoading: banksLoading } = useListPaystackBanksQuery();
  const [resolveAccount, { isLoading: resolving }] = useResolvePaystackAccountMutation();
  const [setupPayout, { isLoading: connecting }] = useSetupPaystackPayoutMutation();

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
      const result = await resolveAccount({ restaurantId, bankCode, accountNumber }).unwrap();
      setVerifiedName(result.accountName);
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotVerifyAccount")));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ restaurantId, bankCode, accountNumber }).unwrap();
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

/**
 * Vendor payouts epic, part 3 of 4 (docs/ROADMAP.md FDP-53) — mirrors PaystackPayoutSetup
 * exactly; the two providers can both be offered side by side for a currency that supports
 * both (e.g. NGN), letting the owner pick either.
 */
function FlutterwavePayoutSetup({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const { data: banks, isLoading: banksLoading } = useListFlutterwaveBanksQuery();
  const [resolveAccount, { isLoading: resolving }] = useResolveFlutterwaveAccountMutation();
  const [setupPayout, { isLoading: connecting }] = useSetupFlutterwavePayoutMutation();

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
      const result = await resolveAccount({ restaurantId, bankCode, accountNumber }).unwrap();
      setVerifiedName(result.accountName);
    } catch (err) {
      setError(getErrorMessage(err, t("couldNotVerifyAccount")));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ restaurantId, bankCode, accountNumber }).unwrap();
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

/**
 * Vendor payouts epic, part 4 of 4 (docs/ROADMAP.md FDP-54) — structurally different from
 * Paystack/Flutterwave: there's no bank-selection form here at all, since Stripe Connect's
 * hosted onboarding collects bank details itself, on Stripe's own domain, never touching this
 * app. The only action is a redirect; whether the account actually becomes usable is decided
 * later by Stripe's `account.updated` webhook, not by anything this page can observe directly —
 * a restaurant that already has a `pending` Stripe entry (started onboarding but didn't finish,
 * or the account-link expired) sees "Continue onboarding" instead of "Connect", but both call
 * the exact same endpoint — the backend reuses the existing connected account either way.
 */
function StripePayoutSetup({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslations("EarningsPage");
  const { toast } = useToast();
  const [setupPayout, { isLoading }] = useSetupStripePayoutMutation();
  const hasPendingAccount = restaurant.payoutAccounts.some(
    (account) => account.provider === "stripe" && account.status === "pending",
  );

  async function handleConnect() {
    try {
      const result = await setupPayout(restaurant._id).unwrap();
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

function Earnings({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslations("EarningsPage");
  const locale = useLocale();
  const { data, isLoading } = useGetRestaurantEarningsQuery(restaurant._id);
  const { data: providers } = useGetPaymentProvidersQuery(restaurant.currency);
  const paystackAvailable = providers?.includes("paystack") ?? false;
  const flutterwaveAvailable = providers?.includes("flutterwave") ?? false;
  const stripeAvailable = providers?.includes("stripe") ?? false;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">{t("earnings")}</h1>
        <p className="text-text-muted">{restaurant.name}</p>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {!data.payoutSetupComplete && (
            <Alert variant="warning" title={t("payoutSetupRequired")}>
              {paystackAvailable || flutterwaveAvailable || stripeAvailable
                ? t("connectPayoutBelow")
                : t("automatedPayoutsNotAvailable")}
            </Alert>
          )}

          {data.deliveredOrders === 0 ? (
            <EmptyState title={t("noEarningsYet")} description={t("earningsAppearHere")} />
          ) : (
            <Card>
              <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <EarningsStat label={t("grossRevenue")} value={formatMoney(data.grossRevenue, data.currency, locale)} />
                <EarningsStat
                  label={t("platformFee")}
                  value={`-${formatMoney(data.platformFeeTotal, data.currency, locale)}`}
                />
                <EarningsStat label={t("netEarned")} value={formatMoney(data.netEarned, data.currency, locale)} />
              </CardContent>
              <CardContent className="border-t border-border pt-4 text-sm text-text-muted">
                {t("fromDeliveredOrders", { count: data.deliveredOrders })}
              </CardContent>
            </Card>
          )}

          {!data.payoutSetupComplete && paystackAvailable && (
            <PaystackPayoutSetup restaurantId={restaurant._id} />
          )}
          {!data.payoutSetupComplete && flutterwaveAvailable && (
            <FlutterwavePayoutSetup restaurantId={restaurant._id} />
          )}
          {!data.payoutSetupComplete && stripeAvailable && (
            <StripePayoutSetup restaurant={restaurant} />
          )}
        </>
      )}
    </Container>
  );
}

function EarningsPage({ id }: { id: string }) {
  const t = useTranslations("EarningsPage");
  const { data: restaurants, isLoading } = useGetMyRestaurantsQuery();
  const restaurant = restaurants?.find((r) => r._id === id);

  if (isLoading) {
    return (
      <Container className="py-10">
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }

  if (!restaurant) {
    return (
      <Container className="py-10">
        <EmptyState title={t("restaurantNotFound")} description={t("mayNotExistOrNoAccess")} />
      </Container>
    );
  }

  return <Earnings restaurant={restaurant} />;
}

export default function DashboardRestaurantEarningsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <EarningsPage id={id} />
    </RequireRole>
  );
}
