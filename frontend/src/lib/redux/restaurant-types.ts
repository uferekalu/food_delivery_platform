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

// Vendor payouts epic (docs/ROADMAP.md FDP-51 onward).
export interface PayoutAccount {
  provider: PaymentProvider;
  status: "pending" | "active";
  reference: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export const RESTAURANT_SORTS = ["newest", "rating", "price_asc", "price_desc", "delivery_time"] as const;
export type RestaurantSort = (typeof RESTAURANT_SORTS)[number];

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  menuItemId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  qty: number;
  selectedModifiers: SelectedModifier[];
  notes: string;
}

export interface Cart {
  restaurantId: string | null;
  restaurantName: string | null;
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
  menuItemId: string;
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

export type NotificationType = "order_placed" | "order_status" | "new_order" | "payment_failed";

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  channels: NotificationChannel[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export interface PromoCode {
  _id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  restaurantId: string | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAnalytics {
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    revenueByCurrency: Record<string, number>;
  };
  restaurants: { approved: number; pending: number };
  riders: { verified: number; pending: number };
  users: Record<string, number>;
}

export interface Order {
  _id: string;
  orderNumber: string;
  customerId: string;
  restaurantId: string;
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
  createdAt: string;
  updatedAt: string;
}
