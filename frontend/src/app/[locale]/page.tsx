"use client";

import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Carousel } from "@/components/ui/carousel";
import { RestaurantCard, PlateIcon } from "@/components/restaurant-card";
import { cn } from "@/lib/cn";
import { Link } from "@/i18n/navigation";
import { SmartLink } from "@/components/smart-link";
import { useAppSelector } from "@/lib/redux/hooks";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";

function StoreIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M5 12l1.5-6h19L27 12M5 12v13h22V12M5 12h22M13 25v-7h6v7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-7">
      <path
        d="M6 12h20l-2 14H8L6 12z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11 12V9a5 5 0 0110 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PillIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-7">
      <rect x="6" y="13" width="20" height="9" rx="4.5" stroke="currentColor" strokeWidth="1.6" transform="rotate(-30 16 17.5)" />
      <path d="M16 12.5l3 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BikeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-6">
      <circle cx="8" cy="23" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="24" cy="23" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 23l5-11h6l5 11M13 12h6M13 12l3-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-6">
      <rect x="4" y="11" width="24" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11V8a2 2 0 012-2h4a2 2 0 012 2v3M4 17h24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-warning">
      <path d="M10 1.5l2.6 5.4 5.9.7-4.4 4.1 1.2 5.8L10 14.8l-5.3 2.7 1.2-5.8-4.4-4.1 5.9-.7L10 1.5z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BentoTile({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={style}
      className={cn(
        "group relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border p-6 transition-colors duration-150 hover:border-border-strong",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col justify-center gap-1 rounded-2xl border border-border bg-surface p-6">
      <span className="text-3xl font-bold text-text">{value}</span>
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

function TogetherItem({
  icon,
  title,
  description,
  href,
  label,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white">{icon}</div>
      <span className="font-semibold text-white">{title}</span>
      <span className="text-sm text-white/70">{description}</span>
      <SmartLink
        href={href}
        className="group mt-1 inline-flex items-center gap-1 text-sm font-semibold text-white hover:underline"
      >
        {label}
        <ArrowIcon />
      </SmartLink>
    </div>
  );
}

export default function Home() {
  const t = useTranslations("HomePage");
  const { user, status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated" && !!user;

  // A large-enough page covers today's restaurant count in one request (see FDP-32 PR) — cheap
  // for a "Top restaurants" rail and doubles as the source for the live stats and "delivering
  // across" strip below, so the homepage doesn't need three separate fetches.
  const { data, isLoading } = useListRestaurantsQuery({ sort: "rating", limit: 50 });
  const topRestaurants = data?.items.slice(0, 8) ?? [];
  const countries = Array.from(new Set((data?.items ?? []).map((r) => r.country))).sort();
  const featuredRestaurant = topRestaurants[0];

  const deliveryMinutes = (data?.items ?? [])
    .map((r) => r.estimatedDeliveryMinutes)
    .filter((v): v is number => v != null);
  const avgDeliveryMinutes =
    deliveryMinutes.length > 0 ? Math.round(deliveryMinutes.reduce((a, b) => a + b, 0) / deliveryMinutes.length) : null;

  const partnerCta =
    authenticated && user.role === "restaurant_owner"
      ? { href: "/dashboard/restaurants", label: t("goToMyRestaurants") }
      : { href: "/register?role=restaurant_owner", label: t("registerYourBusiness") };

  // restaurant_owner and admin accounts can never become riders (RidersService.apply()
  // rejects them outright — see docs/ROADMAP.md FDP-61) — null hides the CTA entirely rather
  // than pointing them at an application they'd only get a 400 from.
  const riderCta =
    authenticated && user.role === "rider"
      ? { href: "/rider", label: t("goToMyDashboard") }
      : authenticated && (user.role === "restaurant_owner" || user.role === "admin")
        ? null
        : { href: "/rider/apply", label: t("registerHere") };

  return (
    <div className="flex flex-col">
      {/* Hero — a solid brand band (not a soft neutral wash) with an angled bottom edge, always
          rendered dark regardless of site theme: a deliberate, theme-invariant brand moment
          rather than another light "hero card with a gradient tint" template. No search box
          here: it's in the persistent header (layout.tsx), reachable from every page — see
          docs/ROADMAP.md FDP-46. */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(135deg, var(--color-brand-700), var(--color-brand-950))",
            clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 88%)",
          }}
        />
        <Container className="relative flex flex-col items-start gap-6 py-20 sm:py-24 lg:py-28">
          <span className="w-fit rounded-full border border-white/30 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase">
            {t("nowDelivering")}
          </span>
          <h1 className="max-w-2xl text-4xl font-bold text-balance text-white sm:text-5xl lg:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="max-w-lg text-lg text-white/80">{t("heroDescription")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/restaurants" className={cn(buttonVariants({ size: "lg" }), "bg-white text-brand-700 hover:bg-neutral-100")}>
              {t("browseRestaurants")}
            </Link>
            <SmartLink
              href={partnerCta.href}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/40 bg-transparent text-white hover:bg-white/10")}
            >
              {partnerCta.label}
            </SmartLink>
          </div>
        </Container>
      </section>

      {/* Floating order-status card straddles the hero's angled edge — hidden below `lg` so it
          never competes with the copy above at a 375px viewport. */}
      <div className="relative z-10 hidden lg:block">
        <Container>
          <div className="-mt-16 flex justify-end">
            <div className="flex w-80 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                  <PlateIcon className="size-6" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-text">
                    {featuredRestaurant?.name ?? t("topRatedNearYou")}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-text-muted">
                    <StarIcon />
                    {featuredRestaurant ? featuredRestaurant.avgRating.toFixed(1) : "4.8"} · {t("openNow")}
                  </span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{t("orderStatus")}</span>
                <Badge variant="success">{t("onTheWay")}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-2/3 rounded-full bg-primary" />
                </div>
                <span className="shrink-0 text-xs text-text-muted">{t("etaMinutes", { minutes: 12 })}</span>
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* Top restaurants comes right after the hero — an auto-advancing carousel rather than a
          static grid — so the thing customers actually want (real restaurants to order from) is
          immediately reachable, not buried below the category tiles (docs/ROADMAP.md FDP-66). */}
      {(isLoading || topRestaurants.length > 0) && (
        <section className="bg-surface-subtle">
          <Container className="flex flex-col gap-6 py-14 lg:pt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-text">{t("topRestaurants")}</h2>
                <p className="text-text-muted">{t("topRestaurantsDescription")}</p>
              </div>
              <Link href="/restaurants" className="text-sm font-medium text-primary hover:underline">
                {t("seeAllRestaurants")}
              </Link>
            </div>
            {isLoading ? (
              <div className="flex gap-4 overflow-x-hidden pb-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 w-72 shrink-0" />
                ))}
              </div>
            ) : (
              <Carousel aria-label={t("topRestaurants")} itemClassName="w-72">
                {topRestaurants.map((restaurant) => (
                  <RestaurantCard key={restaurant._id} restaurant={restaurant} />
                ))}
              </Carousel>
            )}
          </Container>
        </section>
      )}

      {/* Bento grid — one asymmetric composition instead of two separate "3 equal icon tiles"
          and "4 equal restaurant cards" sections, mixing category entry points with live
          platform numbers so the section has real substance, not just repeated cards. */}
      <section className="border-t border-border bg-surface">
        <Container className="flex flex-col gap-6 py-16 lg:py-20 lg:pt-24">
          {countries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-text-muted">{t("nowDeliveringAcross")}</span>
              {countries.map((country) => (
                <Badge key={country} variant="neutral">
                  {country}
                </Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
            <BentoTile
              href="/categories"
              className="lg:col-span-2 lg:row-span-2"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 14%, var(--color-surface)), var(--color-surface))",
              }}
            >
              <div className="flex size-16 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                <StoreIcon className="size-8" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-2xl font-bold text-text">{t("restaurants")}</span>
                <span className="text-text-muted">{t("restaurantsTileDescription")}</span>
                <span className="group mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  {t("exploreRestaurants")}
                  <ArrowIcon />
                </span>
              </div>
            </BentoTile>

            <BentoTile href="/categories?tab=groceries" className="bg-surface">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                <BasketIcon />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-text">{t("groceries")}</span>
                <span className="text-sm text-text-muted">{t("groceriesTileDescription")}</span>
              </div>
              <Badge variant="neutral" className="w-fit">
                {t("comingSoon")}
              </Badge>
            </BentoTile>

            <BentoTile href="/categories?tab=pharmacy" className="bg-surface">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                <PillIcon />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-text">{t("pharmacyAndMore")}</span>
                <span className="text-sm text-text-muted">{t("pharmacyTileDescription")}</span>
              </div>
              <Badge variant="neutral" className="w-fit">
                {t("comingSoon")}
              </Badge>
            </BentoTile>

            {isLoading ? (
              <>
                <Skeleton className="h-full min-h-32 w-full rounded-2xl" />
                <Skeleton className="h-full min-h-32 w-full rounded-2xl" />
              </>
            ) : (
              <>
                <StatTile
                  value={data && data.total > 0 ? data.total : t("new")}
                  label={data && data.total > 0 ? t("restaurantsLiveOnPlatform") : t("restaurantsJoiningWeekly")}
                />
                <StatTile
                  value={avgDeliveryMinutes ? t("etaMinutes", { minutes: avgDeliveryMinutes }) : t("live")}
                  label={avgDeliveryMinutes ? t("averageDeliveryTime") : t("orderTrackingOnMap")}
                />
              </>
            )}
          </div>
        </Container>
      </section>

      {/* Let's do it together — one wide gradient banner with three inline items, instead of
          three separate matching bordered cards (the single most generic "3-feature-card"
          pattern shared by every template homepage). */}
      <section
        style={{ backgroundImage: "linear-gradient(120deg, var(--color-brand-700), var(--color-brand-900))" }}
      >
        <Container className="flex flex-col gap-10 py-16 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex flex-col gap-2 lg:max-w-56 lg:shrink-0">
            <h2 className="text-2xl font-bold text-white">{t("letsDoItTogether")}</h2>
            <p className="text-white/70">{t("letsDoItTogetherDescription")}</p>
          </div>
          <div className={cn("grid grid-cols-1 gap-8", riderCta ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {riderCta && (
              <TogetherItem
                icon={<BikeIcon />}
                title={t("becomeARider")}
                description={t("becomeARiderDescription")}
                href={riderCta.href}
                label={riderCta.label}
              />
            )}
            <TogetherItem
              icon={<StoreIcon className="size-6" />}
              title={t("registerYourBusiness")}
              description={t("registerYourBusinessDescription")}
              href={partnerCta.href}
              label={partnerCta.label}
            />
            <TogetherItem
              icon={<BriefcaseIcon />}
              title={t("careers")}
              description={t("careersDescription")}
              href="/careers"
              label={t("viewCareers")}
            />
          </div>
        </Container>
      </section>
    </div>
  );
}
