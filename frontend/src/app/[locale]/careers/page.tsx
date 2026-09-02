import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CareersPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

function BriefcaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-10">
      <rect x="4" y="11" width="24" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11V8a2 2 0 012-2h4a2 2 0 012 2v3M4 17h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default async function CareersPage() {
  const t = await getTranslations("CareersPage");
  return (
    <Container className="flex flex-col gap-6 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold text-text">{t("careers")}</h1>
        <p className="mx-auto max-w-xl text-text-muted">{t("intro")}</p>
      </div>
      <EmptyState
        icon={<BriefcaseIcon />}
        title={t("notHiringExternally")}
        description={t("noOpenRoles")}
        className="mx-auto max-w-md py-16"
      />
    </Container>
  );
}
