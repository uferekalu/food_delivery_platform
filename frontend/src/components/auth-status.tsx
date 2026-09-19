"use client";

import { useTranslations } from "next-intl";
import { SmartLink } from "./smart-link";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { useLogoutMutation } from "@/lib/redux/services/auth-api";
import { useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/dropdown-menu";

export interface AuthStatusProps {
  /** "stacked" is used inside the mobile nav menu — full-width, vertically stacked controls,
   * kept as plain links rather than a dropdown since a drawer already has the vertical room a
   * congested header doesn't. */
  variant?: "inline" | "stacked";
  /** Fired after any navigation/logout action — lets the mobile menu close itself. */
  onNavigate?: () => void;
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0 text-text-muted">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Menu-item icons for the account dropdown/stacked mobile menu below — decorative only
// (aria-hidden via DropdownMenuItem.icon / explicit aria-hidden here), direct user feedback that
// the account menu ("my dashboard, my orders, my account, logout") read as a wall of plain text
// with nothing to visually distinguish one row from the next (docs/ROADMAP.md FDP-134).
function StorefrontIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M2 6.5 2.8 2.5a1 1 0 0 1 1-.8h8.4a1 1 0 0 1 1 .8l.8 4M2 6.5a1.8 1.8 0 0 0 3.5.6 1.8 1.8 0 0 0 3.5 0 1.8 1.8 0 0 0 3.5 0 1.8 1.8 0 0 0 3.5-.6M2 6.5V13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.5 14v-3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M2.5 6h11l-.9 6.3a1 1 0 0 1-1 .7H4.4a1 1 0 0 1-1-.7L2.5 6z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 6 6.5 2M11 6 9.5 2M5.5 8.5v3M8 8.5v3M10.5 8.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M2 8a6 6 0 1 1 2.6 4.95L2 13.5l.7-2.7A5.96 5.96 0 0 1 2 8z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScooterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <circle cx="3.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3.5 11 5 5h2.5M5 11h5.5l1-4h1.5M9 5H6.8M12.5 11V8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M2 12.5a6 6 0 1 1 12 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 12.5 10.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="12.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M4 1.5h8v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1v-13z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6 5h4M6 7.5h4M6 10h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.7 12.2a4.8 4.8 0 0 1 8.6 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M6.5 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3.5M10.5 11l3-3-3-3M13.2 8H6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthStatus({ variant = "inline", onNavigate }: AuthStatusProps) {
  const t = useTranslations("AuthStatus");
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout, { isLoading }] = useLogoutMutation();
  const stacked = variant === "stacked";

  // Avoid flashing "log in" while the silent session check (SessionInitializer) is in flight.
  if (status === "idle") {
    return <div className={cn("h-9", stacked ? "w-full" : "w-24")} aria-hidden="true" />;
  }

  if (status === "authenticated" && user) {
    // Every one of a vendor/admin/rider's account links used to render as its own separate
    // inline element next to notifications/cart/language/theme — on a real account with several
    // roles' worth of links (e.g. an admin who's also a restaurant_owner) that's 5-6 separate
    // clickable things crammed into one row, the exact "congested header" the user reported
    // (screenshot-annotated). Collapsed into a single avatar-triggered dropdown instead — the
    // standard account-menu pattern — so the header itself only ever shows one control for
    // "everything about my account," regardless of how many roles/links a given user has.
    if (!stacked) {
      const items: DropdownMenuItem[] = [];
      if (user.role === "restaurant_owner" || user.role === "admin") {
        items.push({ label: t("myRestaurants"), icon: <StorefrontIcon />, onSelect: () => router.push("/dashboard/restaurants") });
        items.push({ label: t("myStores"), icon: <BasketIcon />, onSelect: () => router.push("/dashboard/stores") });
      }
      if (user.role === "restaurant_owner") {
        items.push({ label: t("messages"), icon: <ChatBubbleIcon />, onSelect: () => router.push("/dashboard/messages") });
      }
      if (user.role === "rider") {
        items.push({ label: t("riderDashboard"), icon: <ScooterIcon />, onSelect: () => router.push("/rider") });
      }
      if (user.role === "admin") {
        items.push({ label: t("adminDashboard"), icon: <GaugeIcon />, onSelect: () => router.push("/admin") });
      }
      items.push({ label: t("myOrders"), icon: <ReceiptIcon />, onSelect: () => router.push("/orders") });
      items.push({ label: t("myAccount"), icon: <UserCircleIcon />, onSelect: () => router.push("/account") });
      items.push({
        label: t("logOut"),
        icon: <LogOutIcon />,
        destructive: true,
        onSelect: () => void logout(),
      });

      return (
        <DropdownMenu
          align="end"
          items={items}
          trigger={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-1 pl-1 text-sm text-text-muted transition-colors duration-150 hover:bg-secondary hover:text-text"
            >
              <Avatar src={user.avatarUrl} name={user.name} size="sm" />
              <span className="hidden max-w-28 truncate lg:inline">
                {user.name}
                {!user.isEmailVerified && <span className="ml-1 text-warning">{t("unverified")}</span>}
              </span>
              <ChevronDownIcon />
            </button>
          )}
        />
      );
    }

    const stackedLinkClassName = "flex items-center gap-2 py-1 text-sm text-primary hover:underline";

    return (
      <div className="flex flex-col items-stretch gap-3">
        {(user.role === "restaurant_owner" || user.role === "admin") && (
          <SmartLink href="/dashboard/restaurants" onClick={onNavigate} className={stackedLinkClassName}>
            <StorefrontIcon />
            {t("myRestaurants")}
          </SmartLink>
        )}
        {(user.role === "restaurant_owner" || user.role === "admin") && (
          <SmartLink href="/dashboard/stores" onClick={onNavigate} className={stackedLinkClassName}>
            <BasketIcon />
            {t("myStores")}
          </SmartLink>
        )}
        {/* Not shown to admin, unlike the two links above — this is the vendor's own
            conversation with "admin" as a role; an admin has their own dedicated inbox (the
            "Messages" tab in /admin) instead of a single vendor-shaped thread of their own. */}
        {user.role === "restaurant_owner" && (
          <SmartLink href="/dashboard/messages" onClick={onNavigate} className={stackedLinkClassName}>
            <ChatBubbleIcon />
            {t("messages")}
          </SmartLink>
        )}
        {user.role === "rider" && (
          <SmartLink href="/rider" onClick={onNavigate} className={stackedLinkClassName}>
            <ScooterIcon />
            {t("riderDashboard")}
          </SmartLink>
        )}
        {user.role === "admin" && (
          <SmartLink href="/admin" onClick={onNavigate} className={stackedLinkClassName}>
            <GaugeIcon />
            {t("adminDashboard")}
          </SmartLink>
        )}
        <SmartLink href="/orders" onClick={onNavigate} className={stackedLinkClassName}>
          <ReceiptIcon />
          {t("myOrders")}
        </SmartLink>
        <SmartLink
          href="/account"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2 py-1 text-sm text-text-muted hover:text-text"
        >
          <Avatar src={user.avatarUrl} name={user.name} size="sm" />
          <span className="truncate">
            {user.name}
            {!user.isEmailVerified && <span className="ml-1 text-warning">{t("unverified")}</span>}
          </span>
        </SmartLink>
        <Button
          variant="ghost"
          size="sm"
          isLoading={isLoading}
          onClick={() => {
            void logout();
            onNavigate?.();
          }}
          className="w-full justify-start gap-2"
        >
          <LogOutIcon />
          {t("logOut")}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2", stacked ? "flex-col items-stretch" : "items-center")}>
      <SmartLink
        href="/login"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), stacked && "w-full justify-center")}
      >
        {t("logIn")}
      </SmartLink>
      <SmartLink
        href="/register"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), stacked && "w-full justify-center")}
      >
        {t("signUp")}
      </SmartLink>
    </div>
  );
}
