"use client";

import { useTranslations } from "next-intl";
import { SmartLink } from "./smart-link";
import { Logo } from "./logo";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
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
            <SmartLink href={link.href} className="text-sm text-text-muted hover:text-text hover:underline">
              {link.label}
            </SmartLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  const t = useTranslations("Footer");
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
        { href: "/restaurants", label: t("browseRestaurants") },
        { href: "/orders", label: t("myOrders") },
        { href: "/account", label: t("myAccount") },
      ]
    : [
        { href: "/restaurants", label: t("browseRestaurants") },
        { href: "/register", label: t("createAccount") },
        { href: "/login", label: t("logIn") },
      ];

  // A restaurant owner already has both dashboards one click away (myRestaurants/myStores), so
  // the explicit "sell groceries or pharmacy items" link below is only useful to someone who
  // hasn't registered as either kind of owner yet.
  const restaurantLinks: FooterLink[] =
    authenticated && user.role === "restaurant_owner"
      ? [
          { href: "/dashboard/restaurants", label: t("myRestaurants") },
          { href: "/dashboard/stores", label: t("myStores") },
        ]
      : authenticated
        ? [
            { href: "/register?role=restaurant_owner", label: t("partnerWithUs") },
            { href: "/register?type=groceries", label: t("sellGroceriesOrPharmacy") },
          ]
        : [
            { href: "/register?role=restaurant_owner", label: t("partnerWithUs") },
            { href: "/register?type=groceries", label: t("sellGroceriesOrPharmacy") },
            { href: "/login", label: t("logIn") },
          ];

  // restaurant_owner and admin accounts can never become riders (RidersService.apply()
  // rejects them outright — see docs/ROADMAP.md FDP-61) — an empty column hides the whole
  // "For riders" section below rather than pointing them at an application that'd 400.
  const riderLinks: FooterLink[] =
    authenticated && user.role === "rider"
      ? [{ href: "/rider", label: t("riderDashboard") }]
      : authenticated && (user.role === "restaurant_owner" || user.role === "admin")
        ? []
        : authenticated
          ? [{ href: "/rider/apply", label: t("becomeARider") }]
          : [
              { href: "/rider/apply", label: t("becomeARider") },
              { href: "/login", label: t("logIn") },
            ];

  return (
    <footer className="border-t border-border bg-surface-subtle">
      <Container className="flex flex-col gap-8 py-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <SmartLink href="/restaurants" className="flex items-center gap-2">
              <Logo className="size-8" />
              <span className="text-lg font-semibold text-text">{t("siteName")}</span>
            </SmartLink>
            <p className="text-sm text-text-muted">{t("tagline")}</p>
          </div>

          <div
            className={cn(
              "grid grid-cols-1 gap-6 sm:gap-16",
              riderLinks.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2",
            )}
          >
            <FooterNav label={t("forCustomers")} links={customerLinks} />
            <FooterNav label={t("forRestaurants")} links={restaurantLinks} />
            {riderLinks.length > 0 && <FooterNav label={t("forRiders")} links={riderLinks} />}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">{t("copyright", { year })}</p>
          <p className="text-xs text-text-muted">{t("footerTagline")}</p>
        </div>
      </Container>
    </footer>
  );
}
