export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
}

export interface OpeningHour {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  openTime: string; // "HH:mm"
  closeTime: string;
  isClosed?: boolean;
}

export interface Restaurant {
  _id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  cuisineTypes: string[];
  currency: string;
  country: string;
  address: Address;
  openingHours: OpeningHour[];
  isOpen: boolean;
  isApproved: boolean;
  avgRating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

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
