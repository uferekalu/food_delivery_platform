import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RestaurantsPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/restaurants" },
  };
}

export default function RestaurantsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
