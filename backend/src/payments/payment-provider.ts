export const PAYMENT_PROVIDERS = ['stripe', 'paystack', 'flutterwave'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
