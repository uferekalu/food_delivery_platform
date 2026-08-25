import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import NextLink from "next/link";

export default function Home() {
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
          <NextLink href="/register?role=restaurant_owner" className={buttonVariants({ variant: "outline" })}>
            Partner with us
          </NextLink>
        </div>
      </Container>
    </div>
  );
}
