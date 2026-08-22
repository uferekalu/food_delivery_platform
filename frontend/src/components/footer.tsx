import NextLink from "next/link";
import { Logo } from "./logo";
import { Container } from "@/components/ui/container";

const CUSTOMER_LINKS = [
  { href: "/restaurants", label: "Browse restaurants" },
  { href: "/register", label: "Create an account" },
  { href: "/login", label: "Log in" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface-subtle">
      <Container className="flex flex-col gap-10 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <NextLink href="/restaurants" className="flex items-center gap-2">
              <Logo className="size-8" />
              <span className="text-lg font-semibold text-text">Food Delivery Platform</span>
            </NextLink>
            <p className="text-sm text-text-muted">
              Ordering great food from local restaurants, delivered fast and tracked live — from
              checkout to your door.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-16">
            <nav aria-label="For customers" className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-text">For customers</h3>
              <ul className="flex flex-col gap-2">
                {CUSTOMER_LINKS.map((link) => (
                  <li key={link.href}>
                    <NextLink href={link.href} className="text-sm text-text-muted hover:text-text hover:underline">
                      {link.label}
                    </NextLink>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="For restaurants" className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-text">For restaurants</h3>
              <ul className="flex flex-col gap-2">
                <li>
                  <NextLink
                    href="/register?role=restaurant_owner"
                    className="text-sm text-text-muted hover:text-text hover:underline"
                  >
                    Partner with us
                  </NextLink>
                </li>
                <li>
                  <NextLink href="/login" className="text-sm text-text-muted hover:text-text hover:underline">
                    Restaurant dashboard
                  </NextLink>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">© {year} Food Delivery Platform. All rights reserved.</p>
          <p className="text-xs text-text-muted">Built for fast, reliable delivery — everywhere we operate.</p>
        </div>
      </Container>
    </footer>
  );
}
