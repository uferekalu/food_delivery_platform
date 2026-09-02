"use client";

import { use, useState } from "react";
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
      setError(getErrorMessage(err, "Couldn't verify that account number"));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ restaurantId, bankCode, accountNumber }).unwrap();
      toast({ title: "Payout account connected", variant: "success" });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't connect this payout account"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect a Paystack payout account</CardTitle>
        <CardDescription>
          Add your bank details so future orders settle straight to your account, minus the
          platform fee.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Bank" required>
            <Select
              options={bankOptions}
              value={bankCode}
              onChange={(value) => {
                setBankCode(value);
                resetVerification();
              }}
              placeholder={banksLoading ? "Loading banks…" : "Choose your bank"}
              disabled={banksLoading}
              searchable
              searchPlaceholder="Search banks…"
            />
          </FormField>
          <FormField label="Account number" required>
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
          <Alert variant="success" title="Account verified">
            {verifiedName} — if this isn&apos;t right, change the details above and verify again.
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
            Verify account
          </Button>
        )}

        {verifiedName && (
          <Button size="sm" className="w-fit" isLoading={connecting} onClick={() => void handleConnect()}>
            Connect payout account
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
      setError(getErrorMessage(err, "Couldn't verify that account number"));
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await setupPayout({ restaurantId, bankCode, accountNumber }).unwrap();
      toast({ title: "Payout account connected", variant: "success" });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't connect this payout account"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect a Flutterwave payout account</CardTitle>
        <CardDescription>
          Add your bank details so future orders settle straight to your account, minus the
          platform fee.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Bank" required>
            <Select
              options={bankOptions}
              value={bankCode}
              onChange={(value) => {
                setBankCode(value);
                resetVerification();
              }}
              placeholder={banksLoading ? "Loading banks…" : "Choose your bank"}
              disabled={banksLoading}
              searchable
              searchPlaceholder="Search banks…"
            />
          </FormField>
          <FormField label="Account number" required>
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
          <Alert variant="success" title="Account verified">
            {verifiedName} — if this isn&apos;t right, change the details above and verify again.
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
            Verify account
          </Button>
        )}

        {verifiedName && (
          <Button size="sm" className="w-fit" isLoading={connecting} onClick={() => void handleConnect()}>
            Connect payout account
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
      toast({ title: "Couldn't start Stripe onboarding", description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect a Stripe payout account</CardTitle>
        <CardDescription>
          Stripe handles your bank details directly through their own secure onboarding flow —
          you&apos;ll be redirected there, then brought back here once you&apos;re done.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hasPendingAccount && (
          <Alert variant="warning">
            You started connecting a Stripe account but haven&apos;t finished yet. Pick up where
            you left off below.
          </Alert>
        )}
        <Button size="sm" className="w-fit" isLoading={isLoading} onClick={() => void handleConnect()}>
          {hasPendingAccount ? "Continue onboarding" : "Connect with Stripe"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Earnings({ restaurant }: { restaurant: Restaurant }) {
  const { data, isLoading } = useGetRestaurantEarningsQuery(restaurant._id);
  const { data: providers } = useGetPaymentProvidersQuery(restaurant.currency);
  const paystackAvailable = providers?.includes("paystack") ?? false;
  const flutterwaveAvailable = providers?.includes("flutterwave") ?? false;
  const stripeAvailable = providers?.includes("stripe") ?? false;

  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">Earnings</h1>
        <p className="text-text-muted">{restaurant.name}</p>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {!data.payoutSetupComplete && (
            <Alert variant="warning" title="Payout setup required">
              {paystackAvailable || flutterwaveAvailable || stripeAvailable
                ? "Connect a payout account below so your earnings settle automatically."
                : "Automated payouts aren't available for this restaurant's currency yet — your earnings below are informational for now."}
            </Alert>
          )}

          {data.deliveredOrders === 0 ? (
            <EmptyState
              title="No earnings yet"
              description="Earnings appear here once an order for this restaurant is delivered."
            />
          ) : (
            <Card>
              <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <EarningsStat
                  label="Gross revenue"
                  value={`${data.currency} ${data.grossRevenue.toFixed(2)}`}
                />
                <EarningsStat
                  label="Platform fee"
                  value={`-${data.currency} ${data.platformFeeTotal.toFixed(2)}`}
                />
                <EarningsStat label="Net earned" value={`${data.currency} ${data.netEarned.toFixed(2)}`} />
              </CardContent>
              <CardContent className="border-t border-border pt-4 text-sm text-text-muted">
                From {data.deliveredOrders} delivered order{data.deliveredOrders === 1 ? "" : "s"}.
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
        <EmptyState title="Restaurant not found" description="It may not exist, or you don't have access to it." />
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
