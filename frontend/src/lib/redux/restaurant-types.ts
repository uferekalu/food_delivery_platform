import type { UserRole, UserStatus } from "@/lib/constants/roles";

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
}

export interface DeliveryZone {
  _id: string;
  restaurantId: string;
  name: string;
  maxDistanceKm: number;
  baseFee: number;
  perKmFee: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpeningHour {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  openTime: string; // "HH:mm"
  closeTime: string;
  isClosed?: boolean;
}

// Vendor payouts epic (docs/ROADMAP.md FDP-51 onward). bankCode/accountNumber added FDP-92 —
// only ever populated for paystack/flutterwave (stripe's `reference` is a connected account id,
// which is everything a Stripe transfer needs on its own).
export interface PayoutAccount {
  provider: PaymentProvider;
  status: "pending" | "active";
  reference: string | null;
  bankCode: string | null;
  accountNumber: string | null;
}

// Automated business verification (docs/ROADMAP.md FDP-115) — result of the Youverify CAC/RC
// check, run automatically once a restaurant/store is created. Independent of `isApproved`: this
// is what the *provider* said, `isApproved` is what actually gates marketplace visibility.
export const BUSINESS_VERIFICATION_STATUSES = ["not_attempted", "verified", "mismatch"] as const;
export type BusinessVerificationStatus = (typeof BUSINESS_VERIFICATION_STATUSES)[number];

export interface BusinessVerificationResult {
  status: BusinessVerificationStatus;
  providerRegisteredName: string | null;
  providerRegisteredAddress: string | null;
  providerRawStatus: string | null;
  checkedAt: string | null;
  failureReason: string | null;
}

export interface Restaurant {
  _id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  complianceDocumentUrl: string | null;
  businessRegistrationNumber: string | null;
  businessVerification: BusinessVerificationResult;
  cuisineTypes: string[];
  currency: string;
  country: string;
  address: Address;
  openingHours: OpeningHour[];
  isOpen: boolean;
  isApproved: boolean;
  avgRating: number;
  reviewCount: number;
  priceLevel: number;
  estimatedDeliveryMinutes: number | null;
  payoutAccounts: PayoutAccount[];
  /** Sponsored listings (docs/ROADMAP.md FDP-124) — non-null while an ad campaign is currently
   * active for this restaurant. `isSponsored` is the field to actually check/sort on. */
  sponsoredUntil: string | null;
  isSponsored: boolean;
  createdAt: string;
  updatedAt: string;
}

export const RESTAURANT_SORTS = ["newest", "rating", "price_asc", "price_desc", "delivery_time"] as const;
export type RestaurantSort = (typeof RESTAURANT_SORTS)[number];

// "Restaurants near me" (docs/ROADMAP.md FDP-96) — only ever present on a `/restaurants/nearby`
// response, never a stored field.
export type RestaurantWithDistance = Restaurant & { distanceKm: number };

// Grocery/pharmacy marketplace (docs/ROADMAP.md FDP-56) — a close parallel of Restaurant/
// MenuItem/MenuCategory above, not a replacement for them. `SellerType` is shared with Cart/
// Order, which can belong to either vertical.
export type SellerType = "restaurant" | "store";

export const STORE_TYPES = ["groceries", "pharmacy_beauty"] as const;
export type StoreType = (typeof STORE_TYPES)[number];

export interface Store {
  _id: string;
  ownerId: string;
  name: string;
  slug: string;
  type: StoreType;
  tags: string[];
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  complianceDocumentUrl: string | null;
  businessRegistrationNumber: string | null;
  businessVerification: BusinessVerificationResult;
  currency: string;
  country: string;
  address: Address;
  openingHours: OpeningHour[];
  isOpen: boolean;
  isApproved: boolean;
  avgRating: number;
  reviewCount: number;
  estimatedDeliveryMinutes: number | null;
  payoutAccounts: PayoutAccount[];
  /** Sponsored listings (docs/ROADMAP.md FDP-124) — see Restaurant's identical fields. */
  sponsoredUntil: string | null;
  isSponsored: boolean;
  createdAt: string;
  updatedAt: string;
}

export const STORE_SORTS = ["newest", "rating", "delivery_time"] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

// "Stores near me" (docs/ROADMAP.md FDP-96) — see RestaurantWithDistance above.
export type StoreWithDistance = Store & { distanceKm: number };

export interface ProductCategory {
  _id: string;
  storeId: string;
  name: string;
  /** null = a top-level category. */
  parentCategoryId: string | null;
  sortOrder: number;
}

export interface Product {
  _id: string;
  storeId: string;
  /** Always a leaf category. */
  categoryId: string;
  name: string;
  description: string;
  price: number;
  /** Set only while a promo is active on this item — must be lower than price. */
  discountedPrice: number | null;
  costPrice: number | null;
  imageUrl: string | null;
  /** Free-form size/count, e.g. "550ml". */
  unit: string | null;
  /** null = not inventory-tracked (always orderable while isAvailable is true). */
  stockQuantity: number | null;
  isAvailable: boolean;
  sortOrder: number;
}

/** Returned as two flat lists, not a pre-built tree — see backend/src/stores/products.service.ts's
 * getCatalog for why. Walk parentCategoryId client-side to render the category tree. */
export interface StoreCatalog {
  categories: ProductCategory[];
  products: Product[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** A paginated result whose grand total is meaningful only per-currency (docs/ROADMAP.md
 * FDP-128) — this platform is genuinely multi-currency, so `totalsByCurrency` is never summed
 * into one blended number, matching AdminAnalytics.orders.revenueByCurrency's same convention. */
export interface PaginatedResultWithTotals<T> extends PaginatedResult<T> {
  totalsByCurrency: Record<string, number>;
}

export interface ModifierOption {
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  name: string;
  min: number;
  max: number;
  options: ModifierOption[];
}

export interface MenuItem {
  _id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  /** Set only while a promo is active on this item — powers the strikethrough original price
   * (docs/ROADMAP.md FDP-111), mirroring Product.discountedPrice (stores). Null when not set. */
  discountedPrice: number | null;
  /** Owner-only cost to make this item, feeds the sales report's COGS/margin figures — never
   * shown to customers. Null when not set. */
  costPrice: number | null;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  modifierGroups: ModifierGroup[];
}

export interface MenuCategory {
  _id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface SelectedModifier {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface CartItem {
  _id: string;
  menuItemId: string | null;
  productId: string | null;
  name: string;
  price: number;
  imageUrl: string | null;
  qty: number;
  selectedModifiers: SelectedModifier[];
  notes: string;
}

export interface Cart {
  sellerType: SellerType | null;
  restaurantId: string | null;
  restaurantName: string | null;
  storeId: string | null;
  storeName: string | null;
  currency: string | null;
  items: CartItem[];
  subtotal: number;
}

export interface SavedAddress {
  _id: string;
  label: string;
  address: Address;
  isDefault: boolean;
}

export type PaymentProvider = "stripe" | "paystack" | "flutterwave";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PLACED"
  | "ACCEPTED_BY_RESTAURANT"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "ASSIGNED_TO_RIDER"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type OrderPaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface OrderItem {
  menuItemId: string | null;
  productId: string | null;
  name: string;
  price: number;
  imageUrl: string | null;
  qty: number;
  selectedModifiers: SelectedModifier[];
  notes: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: string;
  by: string;
}

export const VEHICLE_TYPES = ["bicycle", "motorcycle", "car", "van"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const GOVERNMENT_ID_TYPES = [
  "national_id",
  "passport",
  "voters_card",
  "drivers_license",
] as const;
export type GovernmentIdType = (typeof GOVERNMENT_ID_TYPES)[number];

// Rider KYC (docs/ROADMAP.md FDP-61) — the surety a rider names to vouch for them.
export interface Guarantor {
  fullName: string;
  phone: string;
  relationship: string;
  address: string;
}

export interface Rider {
  _id: string;
  userId: string;
  vehicleType: VehicleType;
  isOnline: boolean;
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  dateOfBirth: string;
  governmentIdType: GovernmentIdType;
  governmentIdNumber: string;
  governmentIdDocumentUrl: string;
  proofOfAddressDocumentUrl: string;
  driversLicenseNumber: string | null;
  driversLicenseExpiry: string | null;
  driversLicenseDocumentUrl: string | null;
  vehiclePlateNumber: string | null;
  vehicleRegistrationDocumentUrl: string | null;
  guarantor: Guarantor;
  nextOfKinName: string;
  nextOfKinPhone: string;
  nextOfKinRelationship: string;
  payoutAccounts: PayoutAccount[];
  createdAt: string;
  updatedAt: string;
}

export const REVIEW_TARGET_TYPES = ["restaurant", "rider"] as const;
export type ReviewTargetType = (typeof REVIEW_TARGET_TYPES)[number];

export interface Review {
  _id: string;
  targetType: ReviewTargetType;
  targetId: string;
  orderId: string;
  authorId: { _id: string; name: string; avatarUrl: string | null };
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export const NOTIFICATION_CHANNELS = ["inapp", "email", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// Mirrors backend/src/notifications/schemas/notification.schema.ts's NOTIFICATION_TYPES — this
// had drifted out of sync (only 4 of ~19 real values listed) before docs/ROADMAP.md FDP-127;
// kept as a plain string union rather than validated against the backend array at build time, so
// a future backend addition here is a type-annotation update, not a build break, consistent with
// how this file already treats every other cross-cutting enum.
export type NotificationType =
  | "order_placed"
  | "order_status"
  | "new_order"
  | "payment_failed"
  | "payout_account_changed"
  | "payout_succeeded"
  | "payout_failed"
  | "payout_reconciliation_needed"
  | "refund_clawback_created"
  | "refund_reconciliation_needed"
  | "order_refunded_externally"
  | "order_dispute_flagged"
  | "support_ticket_created"
  | "new_vendor_message"
  | "new_admin_message"
  | "business_verification_passed"
  | "business_verification_needs_review"
  | "business_auto_listed"
  | "ad_campaign_created"
  | "ad_campaign_payment_failed"
  | "ad_campaign_active"
  | "ad_campaign_ended";

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  channels: NotificationChannel[];
  // Optional, not just `Record<string, unknown>` (docs/ROADMAP.md FDP-127) — a real notification
  // predating the backend's `minimize: false` fix can still reach the frontend with this key
  // genuinely absent, not `{}`; every read site must use `?.`, never assume it's present.
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// Which business a code belongs to (docs/ROADMAP.md FDP-112) — a discriminated union rather
// than a formatted string so the admin list can render a name + a type-specific badge.
export type PromoCodeScope =
  | { type: "platform" }
  | { type: "restaurant"; id: string; name: string }
  | { type: "store"; id: string; name: string };

// Admin's full list view — same fields as PromoCode below, minus the raw restaurantId/storeId
// (replaced by the resolved `scope`).
export interface AdminPromoCode {
  _id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
  scope: PromoCodeScope;
}

export interface PromoCode {
  _id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  restaurantId: string | null;
  storeId: string | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}

// Sponsored-listing ad campaigns (docs/ROADMAP.md FDP-124).
export const AD_CAMPAIGN_STATUSES = [
  "pending_payment",
  "scheduled",
  "active",
  "ended",
  "cancelled",
] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export const AD_CAMPAIGN_PAYMENT_STATUSES = ["pending", "succeeded", "failed"] as const;
export type AdCampaignPaymentStatus = (typeof AD_CAMPAIGN_PAYMENT_STATUSES)[number];

export type AdCampaignVendor =
  | { type: "restaurant"; id: string; name: string }
  | { type: "store"; id: string; name: string };

export interface AdCampaign {
  _id: string;
  restaurantId: string | null;
  storeId: string | null;
  status: AdCampaignStatus;
  paymentStatus: AdCampaignPaymentStatus;
  startDate: string;
  endDate: string;
  durationDays: number;
  currency: string;
  dailyRate: number;
  totalPrice: number;
  priceOverridden: boolean;
  paymentProvider: PaymentProvider | null;
  markedPaidManually: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
}

// Admin's full list view — same fields as AdCampaign, plus the resolved vendor display.
export interface AdminAdCampaign extends AdCampaign {
  vendor: AdCampaignVendor;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: string;
}

export interface AdminAnalytics {
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    revenueByCurrency: Record<string, number>;
  };
  restaurants: { approved: number; pending: number };
  stores: { approved: number; pending: number };
  riders: { verified: number; pending: number };
  users: Record<string, number>;
}

export interface Order {
  _id: string;
  orderNumber: string;
  customerId: string;
  sellerType: SellerType;
  restaurantId: string | null;
  storeId: string | null;
  riderId: string | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  platformFeeAmount: number;
  restaurantPayoutAmount: number;
  currency: string;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  paymentProvider: PaymentProvider;
  paymentStatus: OrderPaymentStatus;
  paymentRef: string | null;
  deliveryAddress: Address;
  deliveryInstructions: string;
  scheduledFor: string | null;
  estimatedDeliveryAt: string | null;
  promoCode: string | null;
  // Refund-hardening pass (docs/ROADMAP.md FDP-104)
  refundReconciliationRequired: boolean;
  refundFailureReason: string | null;
  disputeFlagged: boolean;
  createdAt: string;
  updatedAt: string;
}

// Admin-wide order transaction ledger (docs/ROADMAP.md FDP-128) — a flatter, audit-facing view
// of an order (vendor resolved to a name, not just a raw id) rather than the full Order shape
// above, which is why this is its own type rather than reusing Order directly.
export interface OrderTransactionVendor {
  type: "restaurant" | "store";
  id: string;
  name: string;
}

export interface OrderTransactionItem {
  name: string;
  qty: number;
  price: number;
}

// Categorical per-order fee breakdown (docs/ROADMAP.md FDP-129) — every `*RatePct` is the
// EFFECTIVE rate actually applied to this specific order (derived server-side from its own
// stored amounts), not today's global rate constant, since fees are snapshotted at order-creation
// time and never rewritten. `deliveryFeeSharePct` is different in kind: delivery fee is real
// distance/zone-based pricing, not a percentage of anything — this is its share of the order's
// total, shown for proportion/context only.
export interface OrderTransaction {
  _id: string;
  orderNumber: string;
  vendor: OrderTransactionVendor;
  items: OrderTransactionItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  platformFeeAmount: number;
  /** What the vendor is actually paid for this order (subtotal minus platformFeeAmount). */
  payoutAmount: number;
  platformFeeRatePct: number;
  serviceFeeRatePct: number;
  taxRatePct: number;
  deliveryFeeSharePct: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
  deliveredAt: string | null;
}

// Reference figures for the "how fees work" explanation shown before both the admin transactions
// ledger and a vendor's sales-report transactions list (docs/ROADMAP.md FDP-129).
export interface FeeSchedule {
  platformCommissionRatePct: number;
  serviceFeeRatePct: number;
  taxRatesByCurrency: Record<string, number>;
}
