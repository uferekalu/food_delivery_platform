"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { buttonVariants, Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RestaurantCard } from "@/components/restaurant-card";
import NextLink from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import { useListRestaurantsQuery } from "@/lib/redux/services/restaurants-api";

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 17l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

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
  const content = (
    <>
      <div className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
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
    </>
  );

  return (
    <NextLink
      href={tile.href}
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6 transition-colors duration-150 hover:border-border-strong"
    >
      {content}
    </NextLink>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated" && !!user;
  const [searchInput, setSearchInput] = useState("");

  // A large-enough page covers today's restaurant count in one request (see FDP-32 PR) — cheap
  // for a "Top restaurants" preview and doubles as the source for the "Countries we deliver"
  // section below, so the homepage doesn't need two separate fetches.
  const { data, isLoading } = useListRestaurantsQuery({ sort: "rating", limit: 50 });
  const topRestaurants = data?.items.slice(0, 4) ?? [];
  const countries = Array.from(new Set((data?.items ?? []).map((r) => r.country))).sort();

  const partnerCta =
    authenticated && user.role === "restaurant_owner"
      ? { href: "/dashboard/restaurants", label: "Go to my restaurants" }
      : { href: "/register?role=restaurant_owner", label: "Register your business" };

  const riderCta =
    authenticated && user.role === "rider"
      ? { href: "/rider", label: "Go to my dashboard" }
      : { href: "/rider/apply", label: "Register here" };

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = searchInput.trim() ? `?search=${encodeURIComponent(searchInput.trim())}` : "";
    router.push(`/restaurants${params}`);
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-surface-subtle">
        <Container className="flex flex-col items-start gap-6 py-20">
          <span className="text-sm font-semibold tracking-wide text-primary uppercase">Food Delivery Platform</span>
          <h1 className="max-w-2xl text-4xl font-bold text-text sm:text-5xl">
            Connecting customers with restaurants and reliable delivery
          </h1>
          <p className="max-w-xl text-lg text-text-muted">
            Order from local restaurants and track your delivery live, from checkout to your door.
            Real-time order status, secure payments, and delivery you can follow on a map.
          </p>
          <form onSubmit={submitSearch} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted">
                <SearchIcon />
              </span>
              <Input
                type="search"
                placeholder="Search restaurants or cuisines…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                aria-label="Search restaurants or cuisines"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <div className="flex flex-wrap gap-3">
            <NextLink href="/restaurants" className={buttonVariants({ variant: "primary" })}>
              Browse restaurants
            </NextLink>
            <NextLink href={partnerCta.href} className={buttonVariants({ variant: "outline" })}>
              {partnerCta.label}
            </NextLink>
          </div>
        </Container>
      </section>

      {/* Top restaurants */}
      {(isLoading || topRestaurants.length > 0) && (
        <section className="border-t border-border bg-surface">
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

      {/* Anything delivered */}
      <section className="border-t border-border bg-surface-subtle">
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

      {/* Countries we deliver */}
      {countries.length > 0 && (
        <section className="border-t border-border bg-surface">
          <Container className="flex flex-col items-center gap-6 py-16 text-center">
            <h2 className="text-2xl font-bold text-text">Countries where we deliver</h2>
            <div className="flex flex-wrap justify-center gap-2">
              {countries.map((country) => (
                <Badge key={country} variant="neutral" className="px-4 py-1.5 text-sm">
                  {country}
                </Badge>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Let's do it together */}
      <section className="border-t border-border bg-surface-subtle">
        <Container className="flex flex-col gap-8 py-16">
          <h2 className="text-center text-2xl font-bold text-text">Let&apos;s do it together</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <BikeIcon />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-text">Become a rider</span>
                <span className="text-sm text-text-muted">
                  Enjoy flexibility and competitive earnings delivering on your own schedule.
                </span>
              </div>
              <NextLink href={riderCta.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {riderCta.label}
              </NextLink>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <StoreIcon />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-text">Register your business</span>
                <span className="text-sm text-text-muted">
                  Grow with us — reach more customers and manage your menu with ease.
                </span>
              </div>
              <NextLink href={partnerCta.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {partnerCta.label}
              </NextLink>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <BriefcaseIcon />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-text">Careers</span>
                <span className="text-sm text-text-muted">
                  Ambitious, humble, and love working with others? We&apos;d like to hear from you.
                </span>
              </div>
              <NextLink href="/careers" className={buttonVariants({ variant: "outline", size: "sm" })}>
                View careers
              </NextLink>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
