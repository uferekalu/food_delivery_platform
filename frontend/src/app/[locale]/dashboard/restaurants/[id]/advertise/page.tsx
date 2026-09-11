"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { VendorAdCampaignsManager } from "@/components/vendor-ad-campaigns-manager";

export default function RestaurantAdvertisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("VendorAdCampaignsPage");
  return (
    <RequireRole roles={["restaurant_owner", "admin"]}>
      <Container className="max-w-3xl py-10">
        <h1 className="mb-6 text-2xl font-bold text-text">{t("myAdCampaigns")}</h1>
        <VendorAdCampaignsManager vendorType="restaurant" vendorId={id} />
      </Container>
    </RequireRole>
  );
}
