"use client";

import NextLink from "next/link";
import { Logo } from "./logo";
import { Container } from "@/components/ui/container";
import { useAppSelector } from "@/lib/redux/hooks";

interface FooterLink {
  href: string;
  label: string;
}

function FooterNav({ label, links }: { label: string; links: FooterLink[] }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text">{label}</h3>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <NextLink href={link.href} className="text-sm text-text-muted hover:text-text hover:underline">
              {link.label}
            </NextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  const { user, status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated" && !!user;
  const year = new Date().getFullYear();

  // Signed-in visitors never see "Create an account" / "Log in" again — those are dead ends for
  // someone already past that step. Each column instead points at the account's own next step:
  // an owner's actual dashboard rather than a link back through /login, same for riders. This
  // mirrors AuthStatus's role-aware links in the header, which the footer had drifted out of
  // sync with (only the header was ever updated as roles/routes were added).
  const customerLinks: FooterLink[] = authenticated
    ? [
        { href: "/restaurants", label: "Browse restaurants" },
        { href: "/orders", label: "My orders" },
        { href: "/account", label: "My account" },
      ]
    : [
        { href: "/restaurants", label: "Browse restaurants" },
        { href: "/register", label: "Create an account" },
        { href: "/login", label: "Log in" },
      ];

  const restaurantLinks: FooterLink[] =
    authenticated && user.role === "restaurant_owner"
      ? [{ href: "/dashboard/restaurants", label: "My restaurants" }]
      : authenticated
        ? [{ href: "/register?role=restaurant_owner", label: "Partner with us" }]
        : [
            { href: "/register?role=restaurant_owner", label: "Partner with us" },
            { href: "/login", label: "Log in" },
          ];

  const riderLinks: FooterLink[] =
    authenticated && user.role === "rider"
      ? [{ href: "/rider", label: "Rider dashboard" }]
      : authenticated
        ? [{ href: "/rider/apply", label: "Become a rider" }]
        : [
            { href: "/rider/apply", label: "Become a rider" },
            { href: "/login", label: "Log in" },
          ];

  return (
    <footer className="border-t border-border bg-surface-subtle">
      <Container className="flex flex-col gap-8 py-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
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

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-16">
            <FooterNav label="For customers" links={customerLinks} />
            <FooterNav label="For restaurants" links={restaurantLinks} />
            <FooterNav label="For riders" links={riderLinks} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">© {year} Food Delivery Platform. All rights reserved.</p>
          <p className="text-xs text-text-muted">Built for fast, reliable delivery — everywhere we operate.</p>
        </div>
      </Container>
    </footer>
  );
}
