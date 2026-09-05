"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { RestaurantsTab } from "./restaurants-tab";
import { StoresTab } from "./stores-tab";
import { RidersTab } from "./riders-tab";
import { PromoCodesTab } from "./promo-codes-tab";
import { RefundsTab } from "./refunds-tab";
import { UsersTab } from "./users-tab";
import { PayoutsTab } from "./payouts-tab";

function AdminDashboard() {
  const t = useTranslations("AdminPage");
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onChange={setTab}>
      <TabList>
        <Tab value="overview">{t("overview")}</Tab>
        <Tab value="restaurants">{t("restaurants")}</Tab>
        <Tab value="stores">{t("stores")}</Tab>
        <Tab value="riders">{t("riders")}</Tab>
        <Tab value="users">{t("users")}</Tab>
        <Tab value="promo-codes">{t("promoCodes")}</Tab>
        <Tab value="refunds">{t("refunds")}</Tab>
        <Tab value="payouts">{t("payouts")}</Tab>
      </TabList>
      <TabPanel value="overview">
        <OverviewTab />
      </TabPanel>
      <TabPanel value="restaurants">
        <RestaurantsTab />
      </TabPanel>
      <TabPanel value="stores">
        <StoresTab />
      </TabPanel>
      <TabPanel value="riders">
        <RidersTab />
      </TabPanel>
      <TabPanel value="users">
        <UsersTab />
      </TabPanel>
      <TabPanel value="promo-codes">
        <PromoCodesTab />
      </TabPanel>
      <TabPanel value="refunds">
        <RefundsTab />
      </TabPanel>
      <TabPanel value="payouts">
        <PayoutsTab />
      </TabPanel>
    </Tabs>
  );
}

export default function AdminPage() {
  const t = useTranslations("AdminPage");
  return (
    <RequireRole roles={["admin"]}>
      <Container className="flex flex-col gap-6 py-10">
        <h1 className="text-2xl font-bold text-text">{t("adminDashboard")}</h1>
        <AdminDashboard />
      </Container>
    </RequireRole>
  );
}
