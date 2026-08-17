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
          This app is under active development. The rest of the product (browsing, ordering,
          checkout, tracking) lands in upcoming phases — see the project roadmap.
        </p>
        <div className="flex gap-3">
          <NextLink href="/design-system" className={buttonVariants({ variant: "primary" })}>
            View the design system
          </NextLink>
        </div>
      </Container>
    </div>
  );
}
