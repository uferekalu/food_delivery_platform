"use client";

import NextLink from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppSelector } from "@/lib/redux/hooks";
import { useGetCartQuery } from "@/lib/redux/services/cart-api";

// Placeholder — the real checkout form (delivery address, instructions, ASAP/scheduled,
// promo codes, order creation) lands in FDP-11. This exists now so the cart drawer's
// "Checkout" link has somewhere real to go instead of 404ing.
export default function CheckoutPage() {
  const { status } = useAppSelector((state) => state.auth);
  const { data: cart, isLoading } = useGetCartQuery(undefined, { skip: status !== "authenticated" });

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

  return (
    <Container className="max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Checkout</CardTitle>
          <CardDescription>
            Full checkout (delivery address, instructions, scheduling, promo codes) is coming soon —
            your cart is saved in the meantime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Spinner />
          ) : !cart || cart.items.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              description="Add items from a restaurant first."
              action={
                <NextLink href="/restaurants" className={buttonVariants({ variant: "primary" })}>
                  Browse restaurants
                </NextLink>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-text">{cart.restaurantName}</p>
              {cart.items.map((item) => (
                <div key={item._id} className="flex items-center justify-between text-sm">
                  <span className="text-text">
                    {item.qty}× {item.name}
                  </span>
                  <span className="text-text-muted">
                    {cart.currency} {((item.price + item.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-text">
                <span>Subtotal</span>
                <span>
                  {cart.currency} {cart.subtotal.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
