"use client";

import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import NextLink from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";

export default function Home() {
  const { user, status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated" && !!user;

  // Someone who already owns a restaurant has nothing to gain from the "become a partner"
  // signup flow — point them at their own dashboard instead. Mirrors Footer's restaurantLinks
  // logic (FDP-25); every other authenticated role still sees the partner upsell, same as there.
  const partnerCta =
    authenticated && user.role === "restaurant_owner"
      ? { href: "/dashboard/restaurants", label: "My restaurants" }
      : { href: "/register?role=restaurant_owner", label: "Partner with us" };

  return (
    <div className="flex flex-1 items-center bg-surface-subtle">
      <Container className="flex flex-col items-start gap-6 py-24">
        <span className="text-sm font-semibold tracking-wide text-primary uppercase">
          Food Delivery Platform
        </span>
        <h1 className="max-w-2xl text-4xl font-bold text-text sm:text-5xl">
          Connecting customers with restaurants and reliable delivery
        </h1>
        <p className="max-w-xl text-lg text-text-muted">
          Order from local restaurants and track your delivery live, from checkout to your
          door. Real-time order status, secure payments, and delivery you can follow on a map.
        </p>
        <div className="flex flex-wrap gap-3">
          <NextLink href="/restaurants" className={buttonVariants({ variant: "primary" })}>
            Browse restaurants
          </NextLink>
          <NextLink href={partnerCta.href} className={buttonVariants({ variant: "outline" })}>
            {partnerCta.label}
          </NextLink>
        </div>
      </Container>
    </div>
  );
}
