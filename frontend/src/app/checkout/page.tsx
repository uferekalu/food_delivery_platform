"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { RadioGroup, RadioOption } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetCartQuery } from "@/lib/redux/services/cart-api";
import { useCreateOrderMutation } from "@/lib/redux/services/orders-api";
import { useValidatePromoCodeMutation } from "@/lib/redux/services/promo-codes-api";
import { useListAddressesQuery } from "@/lib/redux/services/account-api";
import { useGetPaymentProvidersQuery, useInitiatePaymentMutation } from "@/lib/redux/services/payments-api";
import { getErrorMessage } from "@/lib/redux/error";
import type { PaymentProvider } from "@/lib/redux/restaurant-types";

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  stripe: "Card (Stripe)",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
};

// Mirrors backend/src/orders/orders.service.ts's DELIVERY_FEE_RATE/SERVICE_FEE_RATE — a
// client-side preview only. The authoritative fees/total are always whatever the created
// order actually comes back with; this just avoids a jarring "surprise total" between the
// summary shown here and the order confirmation page.
const DELIVERY_FEE_RATE = 0.1;
const SERVICE_FEE_RATE = 0.05;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toLocalDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const schema = z
  .object({
    line1: z.string().min(1, "Required").max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1, "Required").max(100),
    state: z.string().min(1, "Required").max(100),
    postalCode: z.string().max(20).optional(),
    deliveryInstructions: z.string().max(500).optional(),
    timing: z.enum(["asap", "scheduled"]),
    scheduledFor: z.string().optional(),
  })
  .refine((data) => data.timing !== "scheduled" || data.scheduledFor, {
    message: "Pick a date and time",
    path: ["scheduledFor"],
  })
  .refine(
    (data) => data.timing !== "scheduled" || !data.scheduledFor || new Date(data.scheduledFor).getTime() > Date.now(),
    { message: "Must be in the future", path: ["scheduledFor"] },
  );
type FormValues = z.infer<typeof schema>;

interface AppliedPromo {
  code: string;
  discountAmount: number;
}

function CheckoutForm() {
  const { data: cart, isLoading: isLoadingCart } = useGetCartQuery();
  const { data: savedAddresses } = useListAddressesQuery();
  const { data: availableProviders } = useGetPaymentProvidersQuery(cart?.currency ?? "", {
    skip: !cart?.currency,
  });
  const [createOrder, { isLoading: isPlacingOrder }] = useCreateOrderMutation();
  const [initiatePayment, { isLoading: isStartingPayment }] = useInitiatePaymentMutation();
  const [validatePromoCode, { isLoading: isValidatingPromo }] = useValidatePromoCodeMutation();

  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [showPromoField, setShowPromoField] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | undefined>(undefined);
  // Real distance-based delivery fees (FDP-15) need lat/lng, not the free-text address fields —
  // there's no geocoding integration, so this is the only source of real coordinates at
  // checkout. Kept out of the address zod schema since it's device-derived, not typed.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "error">("idle");

  function detectLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus("idle");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { timing: "asap" },
  });
  const timing = watch("timing");

  function fillFromSavedAddress(addressId: string) {
    const saved = savedAddresses?.find((a) => a._id === addressId);
    if (!saved) return;
    setValue("line1", saved.address.line1, { shouldValidate: true });
    setValue("line2", saved.address.line2 ?? "");
    setValue("city", saved.address.city, { shouldValidate: true });
    setValue("state", saved.address.state, { shouldValidate: true });
    setValue("postalCode", saved.address.postalCode ?? "");
    setCoords(
      saved.address.lat != null && saved.address.lng != null
        ? { lat: saved.address.lat, lng: saved.address.lng }
        : null,
    );
  }

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code || !cart?.restaurantId) return;
    setPromoError(null);
    try {
      const result = await validatePromoCode({
        code,
        restaurantId: cart.restaurantId,
        subtotal: cart.subtotal,
      }).unwrap();
      if (result.valid) {
        setAppliedPromo({ code: code.toUpperCase(), discountAmount: result.discountAmount });
      } else {
        setAppliedPromo(null);
        setPromoError(result.reason);
      }
    } catch (err) {
      setAppliedPromo(null);
      setPromoError(getErrorMessage(err, "Couldn't validate that code"));
    }
  }

  function removePromo() {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      const order = await createOrder({
        deliveryAddress: {
          line1: values.line1,
          line2: values.line2?.trim() || undefined,
          city: values.city,
          state: values.state,
          postalCode: values.postalCode?.trim() || undefined,
          lat: coords?.lat,
          lng: coords?.lng,
        },
        deliveryInstructions: values.deliveryInstructions?.trim() || undefined,
        scheduledFor: values.timing === "scheduled" && values.scheduledFor ? new Date(values.scheduledFor).toISOString() : undefined,
        promoCode: appliedPromo?.code,
      }).unwrap();

      const payment = await initiatePayment({ orderId: order._id, provider: selectedProvider }).unwrap();
      // A hard navigation, not router.push — the payment provider's hosted checkout page lives
      // on a different origin entirely.
      window.location.href = payment.redirectUrl;
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Couldn't place your order"));
    }
  }

  if (isLoadingCart) {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label="Loading your cart" />
      </Container>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <Container className="py-10">
        <EmptyState
          title="Your cart is empty"
          description="Add items from a restaurant before checking out."
          action={
            <NextLink href="/restaurants" className={buttonVariants({ variant: "primary" })}>
              Browse restaurants
            </NextLink>
          }
        />
      </Container>
    );
  }

  const subtotal = cart.subtotal;
  const estDeliveryFee = round2(subtotal * DELIVERY_FEE_RATE);
  const estServiceFee = round2(subtotal * SERVICE_FEE_RATE);
  const discount = appliedPromo?.discountAmount ?? 0;
  const estTotal = Math.max(0, round2(subtotal + estDeliveryFee + estServiceFee - discount));
  const currency = cart.currency ?? "";

  return (
    <Container className="max-w-5xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">Checkout</h1>
      {submitError && (
        <Alert variant="danger" className="mb-4">
          {submitError}
        </Alert>
      )}
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Delivery address</CardTitle>
            <CardDescription>{cart.restaurantName}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {savedAddresses && savedAddresses.length > 0 && (
              <FormField label="Use a saved address" hint="Selecting one fills in the fields below — you can still edit them.">
                <Select
                  placeholder="Choose a saved address…"
                  options={savedAddresses.map((a) => ({
                    value: a._id,
                    label: `${a.label}${a.isDefault ? " (Default)" : ""} — ${a.address.line1}`,
                  }))}
                  onChange={fillFromSavedAddress}
                />
              </FormField>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" isLoading={geoStatus === "loading"} onClick={detectLocation}>
                Use my current location
              </Button>
              {coords && <span className="text-sm text-success">Location detected — real delivery fee will apply</span>}
              {geoStatus === "error" && (
                <span className="text-sm text-text-muted">Couldn&apos;t get your location — an estimated fee will apply</span>
              )}
            </div>
            <FormField label="Address line 1" error={errors.line1?.message} required>
              <Input {...register("line1")} />
            </FormField>
            <FormField label="Address line 2" error={errors.line2?.message}>
              <Input {...register("line2")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="City" error={errors.city?.message} required>
                <Input {...register("city")} />
              </FormField>
              <FormField label="State" error={errors.state?.message} required>
                <Input {...register("state")} />
              </FormField>
              <FormField label="Postal code" error={errors.postalCode?.message}>
                <Input {...register("postalCode")} />
              </FormField>
            </div>
            <FormField label="Delivery instructions (optional)" error={errors.deliveryInstructions?.message}>
              <Textarea {...register("deliveryInstructions")} rows={2} placeholder="E.g. gate code, landmark" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery options</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["asap", "scheduled"] as const).map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors duration-150 ${
                    timing === option ? "border-primary bg-primary-subtle" : "border-border hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery-timing"
                    value={option}
                    checked={timing === option}
                    onChange={() => setValue("timing", option, { shouldValidate: true })}
                    className="sr-only"
                  />
                  <span className="font-medium text-text">{option === "asap" ? "Standard" : "Schedule"}</span>
                  <span className="text-xs text-text-muted">
                    {option === "asap" ? "As soon as possible" : "Pick a date and time"}
                  </span>
                </label>
              ))}
            </div>
            {timing === "scheduled" && (
              <FormField label="Delivery date and time" error={errors.scheduledFor?.message} required>
                <Input
                  type="datetime-local"
                  min={toLocalDateTimeInputValue(new Date(Date.now() + 15 * 60_000))}
                  {...register("scheduledFor")}
                />
              </FormField>
            )}
          </CardContent>
        </Card>

        {availableProviders && availableProviders.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Payment method</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <RadioGroup
                label="Payment method"
                value={selectedProvider ?? availableProviders[0]}
                onChange={(value) => setSelectedProvider(value as PaymentProvider)}
              >
                {availableProviders.map((provider) => (
                  <RadioOption key={provider} value={provider} label={PROVIDER_LABELS[provider]} />
                ))}
              </RadioGroup>

              <div className="border-t border-border pt-3">
                {appliedPromo ? (
                  <Alert variant="success" title={`"${appliedPromo.code}" applied`}>
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        -{currency} {appliedPromo.discountAmount.toFixed(2)}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={removePromo}>
                        Remove
                      </Button>
                    </div>
                  </Alert>
                ) : showPromoField ? (
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Input
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        placeholder="Enter a promo code"
                        invalid={!!promoError}
                        autoFocus
                      />
                      {promoError && <p className="mt-1 text-sm text-danger">{promoError}</p>}
                    </div>
                    <Button type="button" variant="outline" isLoading={isValidatingPromo} onClick={() => void applyPromo()}>
                      Apply
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPromoField(true)}
                    className="flex w-full items-center justify-between text-sm font-medium text-primary hover:underline"
                  >
                    Got a promo code?
                    <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              {cart.items.length} item{cart.items.length === 1 ? "" : "s"} from {cart.restaurantName}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {cart.items.map((item) => (
                <div key={item._id} className="flex items-center gap-2 text-sm">
                  {item.imageUrl ? (
                    // A small checkout-summary thumbnail doesn't warrant next/image's layout machinery.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="size-9 shrink-0 rounded-md bg-secondary" />
                  )}
                  <span className="flex-1 text-text">
                    {item.qty}× {item.name}
                  </span>
                  <span className="text-text-muted">
                    {currency} {((item.price + item.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <div className="flex items-center justify-between text-text-muted">
                <span>Products</span>
                <span>
                  {currency} {subtotal.toFixed(2)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-success">
                  <span>Promotion</span>
                  <span>
                    -{currency} {discount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-text-muted">
                <span>Delivery (est.)</span>
                <span>
                  {currency} {estDeliveryFee.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-text-muted">
                <span>Service fee (est.)</span>
                <span>
                  {currency} {estServiceFee.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-text">
                <span>Total</span>
                <span>
                  {currency} {estTotal.toFixed(2)}
                </span>
              </div>
            </div>
            <Button type="submit" isLoading={isPlacingOrder || isStartingPayment} size="lg" className="mt-1">
              Pay to order
            </Button>
          </CardContent>
        </Card>
      </div>
      </div>
      </form>
    </Container>
  );
}

export default function CheckoutPage() {
  const { status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label="Checking your session" />
      </Container>
    );
  }

  if (status !== "authenticated") {
    return (
      <Container className="py-10">
        <EmptyState
          title="Log in to checkout"
          description="You'll need an account to place an order."
          action={
            <NextLink href="/login" className={buttonVariants({ variant: "primary" })}>
              Log in
            </NextLink>
          }
        />
      </Container>
    );
  }

  return <CheckoutForm />;
}
