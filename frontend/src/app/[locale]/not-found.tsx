import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { NotFoundContent } from "@/components/not-found-content";

export default async function LocaleNotFound() {
  const t = await getTranslations("NotFoundPage");

  return (
    <NotFoundContent
      eyebrow={t("eyebrow")}
      title={t("title")}
      description={t("description")}
      homeButton={
        <Link href="/" className={buttonVariants({ variant: "primary", size: "lg" })}>
          {t("backToHomepage")}
        </Link>
      }
    />
  );
}
