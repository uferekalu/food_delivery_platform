"use client";

import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RestaurantCard, PlateIcon } from "@/components/restaurant-card";
import NextLink from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";

function StoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-7">
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
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-7">
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
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-7">
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

/**
 * A wave, not a straight edge — one of the few genuinely distinctive shapes available without
 * an illustration asset, used to break the hero's rectangle into the section below it rather
 * than a flat color-band handoff. Fill matches the very next section's background exactly so
 * the curve reads as the *next* section's edge tucking under the hero, not a decoration
 * floating on top of it.
 */
function WaveDivider({ fillClassName }: { fillClassName: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className="absolute inset-x-0 -bottom-px h-12 w-full sm:h-16"
    >
      <path
        d="M0 32C240 68 480 68 720 46C960 24 1200 4 1440 24V80H0V32Z"
        className={fillClassName}
      />
    </svg>
  );
}

interface CategoryTile {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  comingSoon?: boolean;
}

const CATEGORY_TILES: CategoryTile[] = [
  {
    icon: <StoreIcon />,
    title: "Restaurants",
    description: "Order from local restaurants — starters to dessert, delivered hot.",
    href: "/categories",
  },
  {
    icon: <BasketIcon />,
    title: "Groceries",
    description: "Everyday essentials from nearby stores.",
    href: "/categories?tab=groceries",
    comingSoon: true,
  },
  {
    icon: <PillIcon />,
    title: "Pharmacy & more",
    description: "Health and wellness, delivered.",
    href: "/categories?tab=pharmacy",
    comingSoon: true,
  },
];

function CategoryCard({ tile }: { tile: CategoryTile }) {
  return (
    <NextLink
      href={tile.href}
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6 transition-colors duration-150 hover:border-border-strong"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
        {tile.icon}
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-text">{tile.title}</span>
        <span className="text-sm text-text-muted">{tile.description}</span>
      </div>
      {tile.comingSoon && (
        <Badge variant="neutral" className="w-fit">
          Coming soon
        </Badge>
      )}
    </NextLink>
  );
}

function TogetherCard({
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
    <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-text">{title}</span>
        <span className="text-sm text-text-muted">{description}</span>
      </div>
      <NextLink href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {label}
      </NextLink>
    </div>
  );
}

export default function Home() {
  const { user, status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated" && !!user;

  // A large-enough page covers today's restaurant count in one request (see FDP-32 PR) — cheap
  // for a "Top restaurants" preview and doubles as the source for the "Countries we deliver"
  // strip below, so the homepage doesn't need two separate fetches.
  const { data, isLoading } = useListRestaurantsQuery({ sort: "rating", limit: 50 });
  const topRestaurants = data?.items.slice(0, 4) ?? [];
  const countries = Array.from(new Set((data?.items ?? []).map((r) => r.country))).sort();
  const featuredRestaurant = topRestaurants[0];

  const partnerCta =
    authenticated && user.role === "restaurant_owner"
      ? { href: "/dashboard/restaurants", label: "Go to my restaurants" }
      : { href: "/register?role=restaurant_owner", label: "Register your business" };

  const riderCta =
    authenticated && user.role === "rider"
      ? { href: "/rider", label: "Go to my dashboard" }
      : { href: "/rider/apply", label: "Register here" };

  return (
    <div className="flex flex-col">
      {/* Hero — two columns on desktop (copy + a floating order-status mock), gradient wash +
          soft blobs instead of a flat band, wave edge into the section below. No search box
          here anymore: it's in the persistent header (see layout.tsx) so it's reachable from
          every page, not just this one — docs/ROADMAP.md FDP-46. */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 60% 50% at 12% 15%, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 70%)",
            "radial-gradient(ellipse 55% 60% at 90% -10%, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 65%)",
            "linear-gradient(180deg, var(--color-surface-subtle), var(--color-surface-subtle))",
          ].join(", "),
        }}
      >
        <Container className="relative grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="flex flex-col items-start gap-6">
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
              Now delivering
            </span>
            <h1 className="max-w-xl text-4xl font-bold text-balance text-text sm:text-5xl">
              Your favorite restaurants, on their way in minutes
            </h1>
            <p className="max-w-lg text-lg text-text-muted">
              Browse local restaurants, order in a couple of taps, and follow your delivery on a
              live map — from checkout to your door.
            </p>
            <div className="flex flex-wrap gap-3">
              <NextLink href="/restaurants" className={buttonVariants({ variant: "primary" })}>
                Browse restaurants
              </NextLink>
              <NextLink href={partnerCta.href} className={buttonVariants({ variant: "outline" })}>
                {partnerCta.label}
              </NextLink>
            </div>
          </div>

          {/* Decorative floating card — hidden on mobile so it never competes for space with
              the copy above at a 375px viewport (frontend/CLAUDE.md responsive bar). */}
          <div className="relative hidden aspect-square items-center justify-center lg:flex">
            <div
              className="absolute inset-6 rounded-[2.5rem]"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 22%, var(--color-surface)), color-mix(in srgb, var(--color-primary) 5%, var(--color-surface)))",
              }}
            />
            <div className="relative flex w-72 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                  <PlateIcon className="size-6" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-text">
                    {featuredRestaurant?.name ?? "Top-rated near you"}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-text-muted">
                    <StarIcon />
                    {featuredRestaurant ? featuredRestaurant.avgRating.toFixed(1) : "4.8"} · Open now
                  </span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Order status</span>
                <Badge variant="success">On the way</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-2/3 rounded-full bg-primary" />
                </div>
                <span className="shrink-0 text-xs text-text-muted">~12 min</span>
              </div>
            </div>
          </div>
        </Container>
        <WaveDivider fillClassName="fill-[var(--color-surface)]" />
      </section>

      {/* Countries we deliver — a slim strip, not a full section with its own heading, so it
          reads as supporting detail rather than another copy-pasted grid block. */}
      {countries.length > 0 && (
        <section className="border-b border-border bg-surface">
          <Container className="flex flex-wrap items-center justify-center gap-3 py-5 text-center">
            <span className="text-sm font-medium text-text-muted">Now delivering across</span>
            <div className="flex flex-wrap justify-center gap-2">
              {countries.map((country) => (
                <Badge key={country} variant="neutral">
                  {country}
                </Badge>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Anything delivered */}
      <section className="bg-surface">
        <Container className="flex flex-col gap-8 py-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-bold text-text">Anything delivered</h2>
            <p className="max-w-lg text-text-muted">
              Restaurants are live today — groceries and pharmacy are next on our roadmap.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CATEGORY_TILES.map((tile) => (
              <CategoryCard key={tile.title} tile={tile} />
            ))}
          </div>
        </Container>
      </section>

      {/* Top restaurants */}
      {(isLoading || topRestaurants.length > 0) && (
        <section className="border-t border-border bg-surface-subtle">
          <Container className="flex flex-col gap-6 py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-text">Top restaurants</h2>
                <p className="text-text-muted">The best-rated places on the platform right now.</p>
              </div>
              <NextLink href="/restaurants" className="text-sm font-medium text-primary hover:underline">
                See all restaurants →
              </NextLink>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)
                : topRestaurants.map((restaurant) => (
                    <RestaurantCard key={restaurant._id} restaurant={restaurant} />
                  ))}
            </div>
          </Container>
        </section>
      )}

      {/* Let's do it together */}
      <section className="border-t border-border bg-surface">
        <Container className="flex flex-col gap-8 py-16">
          <h2 className="text-center text-2xl font-bold text-text">Let&apos;s do it together</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TogetherCard
              icon={<BikeIcon />}
              title="Become a rider"
              description="Enjoy flexibility and competitive earnings delivering on your own schedule."
              href={riderCta.href}
              label={riderCta.label}
            />
            <TogetherCard
              icon={<StoreIcon />}
              title="Register your business"
              description="Grow with us — reach more customers and manage your menu with ease."
              href={partnerCta.href}
              label={partnerCta.label}
            />
            <TogetherCard
              icon={<BriefcaseIcon />}
              title="Careers"
              description="Ambitious, humble, and love working with others? We'd like to hear from you."
              href="/careers"
              label="View careers"
            />
          </div>
        </Container>
      </section>
    </div>
  );
}
