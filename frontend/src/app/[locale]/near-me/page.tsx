"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { RestaurantCard, PlateIcon } from "@/components/restaurant-card";
import { StoreCard, BasketIcon, PillIcon } from "@/components/store-card";
import { useGetNearbyRestaurantsQuery } from "@/lib/redux/services/restaurants-api";
import { useGetNearbyStoresQuery } from "@/lib/redux/services/stores-api";
import { useGeolocation, type Coordinates } from "@/lib/geolocation";
import type { StoreType } from "@/lib/redux/restaurant-types";

const RADIUS_KM = 10;

function LocationGate({ onRetry, errorReason }: { onRetry: () => void; errorReason: string | null }) {
  const t = useTranslations("NearMePage");

  const message =
    errorReason === "denied"
      ? t("locationDenied")
      : errorReason === "unsupported"
        ? t("locationUnsupported")
        : errorReason
          ? t("locationFailed")
          : null;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        {message && <Alert variant="warning">{message}</Alert>}
        <p className="max-w-md text-text-muted">{t("explainer")}</p>
        <Button onClick={onRetry}>{t("useMyLocation")}</Button>
      </CardContent>
    </Card>
  );
}

function NearbyRestaurants({ coords }: { coords: Coordinates }) {
  const t = useTranslations("NearMePage");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useGetNearbyRestaurantsQuery({
    lat: coords.lat,
    lng: coords.lng,
    radiusKm: RADIUS_KM,
    page,
    limit: 12,
  });

  if (isError) return <Alert variant="danger">{t("couldNotLoad")}</Alert>;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <EmptyState icon={<PlateIcon />} title={t("noneNearby")} description={t("tryWiderArea")} />;
  }

  return (
    <>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? "opacity-60" : ""}`}>
        {data.items.map((restaurant) => (
          <RestaurantCard key={restaurant._id} restaurant={restaurant} distanceKm={restaurant.distanceKm} />
        ))}
      </div>
      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
    </>
  );
}

function NearbyStores({ coords, storeType }: { coords: Coordinates; storeType: StoreType }) {
  const t = useTranslations("NearMePage");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError } = useGetNearbyStoresQuery({
    lat: coords.lat,
    lng: coords.lng,
    type: storeType,
    radiusKm: RADIUS_KM,
    page,
    limit: 12,
  });

  if (isError) return <Alert variant="danger">{t("couldNotLoad")}</Alert>;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={storeType === "groceries" ? <BasketIcon /> : <PillIcon />}
        title={t("noneNearby")}
        description={t("tryWiderArea")}
      />
    );
  }

  return (
    <>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isFetching ? "opacity-60" : ""}`}>
        {data.items.map((store) => (
          <StoreCard key={store._id} store={store} distanceKm={store.distanceKm} />
        ))}
      </div>
      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
    </>
  );
}

function NearMeContent() {
  const t = useTranslations("NearMePage");
  const { status, coords, errorReason, request } = useGeolocation();
  const [tab, setTab] = useState("restaurants");

  if (status !== "success" || !coords) {
    return <LocationGate onRetry={request} errorReason={status === "error" ? errorReason : null} />;
  }

  return (
    <Tabs value={tab} onChange={setTab}>
      <TabList>
        <Tab value="restaurants">{t("restaurants")}</Tab>
        <Tab value="groceries">{t("groceries")}</Tab>
        <Tab value="pharmacy_beauty">{t("pharmacyBeauty")}</Tab>
      </TabList>
      <TabPanel value="restaurants">
        <NearbyRestaurants coords={coords} />
      </TabPanel>
      <TabPanel value="groceries">
        <NearbyStores coords={coords} storeType="groceries" />
      </TabPanel>
      <TabPanel value="pharmacy_beauty">
        <NearbyStores coords={coords} storeType="pharmacy_beauty" />
      </TabPanel>
    </Tabs>
  );
}

export default function NearMePage() {
  const t = useTranslations("NearMePage");
  return (
    <Container className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
        <p className="text-text-muted">{t("subtitle", { radiusKm: RADIUS_KM })}</p>
      </div>
      <NearMeContent />
    </Container>
  );
}
