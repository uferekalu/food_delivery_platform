import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Restaurants",
  description: "Browse local restaurants, filter by cuisine, price, rating, and delivery time.",
  alternates: { canonical: "/restaurants" },
};

export default function RestaurantsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
