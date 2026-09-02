"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { ProfileTab } from "./profile-tab";
import { AddressesTab } from "./addresses-tab";
import { FavoritesTab } from "./favorites-tab";

type AccountTab = "profile" | "addresses" | "favorites";

function AccountTabs() {
  const t = useTranslations("AccountPage");
  const [tab, setTab] = useState<AccountTab>("profile");

  return (
    <Tabs value={tab} onChange={(value) => setTab(value as AccountTab)}>
      <TabList>
        <Tab value="profile">{t("profile")}</Tab>
        <Tab value="addresses">{t("addresses")}</Tab>
        <Tab value="favorites">{t("favorites")}</Tab>
      </TabList>
      <TabPanel value="profile">
        <ProfileTab />
      </TabPanel>
      <TabPanel value="addresses">
        <AddressesTab />
      </TabPanel>
      <TabPanel value="favorites">
        <FavoritesTab />
      </TabPanel>
    </Tabs>
  );
}

export default function AccountPage() {
  const t = useTranslations("AccountPage");
  const { status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label={t("checkingSession")} />
      </Container>
    );
  }

  if (status !== "authenticated") {
    return (
      <Container className="py-10">
        <EmptyState
          title={t("logInToManageAccount")}
          description={t("needToBeLoggedIn")}
          action={
            <Link href="/login" className={buttonVariants({ variant: "primary" })}>
              {t("logIn")}
            </Link>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("yourAccount")}</h1>
      <AccountTabs />
    </Container>
  );
}
