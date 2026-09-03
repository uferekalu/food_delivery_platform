"use client";

import { useState } from "react";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { RestaurantsTab } from "./restaurants-tab";
import { RidersTab } from "./riders-tab";
import { PromoCodesTab } from "./promo-codes-tab";
import { RefundsTab } from "./refunds-tab";

function AdminDashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onChange={setTab}>
      <TabList>
        <Tab value="overview">Overview</Tab>
        <Tab value="restaurants">Restaurants</Tab>
        <Tab value="riders">Riders</Tab>
        <Tab value="promo-codes">Promo codes</Tab>
        <Tab value="refunds">Refunds</Tab>
      </TabList>
      <TabPanel value="overview">
        <OverviewTab />
      </TabPanel>
      <TabPanel value="restaurants">
        <RestaurantsTab />
      </TabPanel>
      <TabPanel value="riders">
        <RidersTab />
      </TabPanel>
      <TabPanel value="promo-codes">
        <PromoCodesTab />
      </TabPanel>
      <TabPanel value="refunds">
        <RefundsTab />
      </TabPanel>
    </Tabs>
  );
}

export default function AdminPage() {
  return (
    <RequireRole roles={["admin"]}>
      <Container className="flex flex-col gap-6 py-10">
        <h1 className="text-2xl font-bold text-text">Admin dashboard</h1>
        <AdminDashboard />
      </Container>
    </RequireRole>
  );
}
