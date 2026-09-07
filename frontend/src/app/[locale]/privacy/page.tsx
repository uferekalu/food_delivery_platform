import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/alert";

const SECTION_COUNT = 12;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PrivacyPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("PrivacyPage");
  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => ({
    title: t(`section${i + 1}Title`),
    body: t(`section${i + 1}Body`),
  }));

  return (
    <Container className="flex flex-col gap-8 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-text">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("lastUpdated")}</p>
      </div>
      <Alert variant="info">{t("templateNotice")}</Alert>
      <div className="flex flex-col gap-8">
        {sections.map((section, i) => (
          <div key={i} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-text">{section.title}</h2>
            <p className="text-sm whitespace-pre-line text-text-muted">{section.body}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
