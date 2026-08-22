"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
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
import { useToast } from "@/components/ui/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetCartQuery } from "@/lib/redux/services/cart-api";
import { useCreateOrderMutation } from "@/lib/redux/services/orders-api";
import { useValidatePromoCodeMutation } from "@/lib/redux/services/promo-codes-api";
import { useListAddressesQuery } from "@/lib/redux/services/account-api";
import { getErrorMessage } from "@/lib/redux/error";

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
  const router = useRouter();
  const { toast } = useToast();
  const { data: cart, isLoading: isLoadingCart } = useGetCartQuery();
  const { data: savedAddresses } = useListAddressesQuery();
  const [createOrder, { isLoading: isPlacingOrder }] = useCreateOrderMutation();
  const [validatePromoCode, { isLoading: isValidatingPromo }] = useValidatePromoCodeMutation();

  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        },
        deliveryInstructions: values.deliveryInstructions?.trim() || undefined,
        scheduledFor: values.timing === "scheduled" && values.scheduledFor ? new Date(values.scheduledFor).toISOString() : undefined,
        promoCode: appliedPromo?.code,
      }).unwrap();
      toast({ title: "Order placed", description: `Order ${order.orderNumber} is on its way to being confirmed.`, variant: "success" });
      router.push(`/orders/${order._id}`);
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
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">Checkout</h1>
      {submitError && (
        <Alert variant="danger" className="mb-4">
          {submitError}
        </Alert>
      )}
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-5" noValidate>
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
            <CardTitle>Delivery time</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RadioGroup
              label="Delivery time"
              value={timing}
              onChange={(value) => setValue("timing", value as FormValues["timing"], { shouldValidate: true })}
            >
              <RadioOption value="asap" label="As soon as possible" />
              <RadioOption value="scheduled" label="Schedule for later" />
            </RadioGroup>
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

        <Card>
          <CardHeader>
            <CardTitle>Promo code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Enter a promo code"
                    invalid={!!promoError}
                  />
                  {promoError && <p className="mt-1 text-sm text-danger">{promoError}</p>}
                </div>
                <Button type="button" variant="outline" isLoading={isValidatingPromo} onClick={() => void applyPromo()}>
                  Apply
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              {cart.items.map((item) => (
                <div key={item._id} className="flex items-center justify-between text-sm">
                  <span className="text-text">
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
                <span>Subtotal</span>
                <span>
                  {currency} {subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-text-muted">
                <span>Delivery fee (est.)</span>
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
              {discount > 0 && (
                <div className="flex items-center justify-between text-success">
                  <span>Discount</span>
                  <span>
                    -{currency} {discount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-text">
                <span>Estimated total</span>
                <span>
                  {currency} {estTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" isLoading={isPlacingOrder} size="lg">
          Place order
        </Button>
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
