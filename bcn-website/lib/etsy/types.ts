export type EtsyConnectionRow = {
  id: string;
  admin_user_id: string | null;
  etsy_user_id: number | null;
  shop_id: number | null;
  shop_name: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  granted_scopes: string[] | null;
  oauth_state_hash: string | null;
  oauth_code_verifier_encrypted: string | null;
  oauth_state_expires_at: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EtsyTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  grantedScopes: string[];
};

export type EtsySelf = {
  user_id: number;
  shop_id: number;
};

export type EtsyMoney = {
  amount: number;
  divisor: number;
  currency_code: string;
};

export type EtsyShop = {
  shop_id: number;
  user_id: number;
  shop_name: string;
  title?: string | null;
  currency_code?: string | null;
  is_vacation?: boolean;
  listing_active_count?: number;
  url?: string | null;
  review_count?: number;
  review_average?: number;
};

export type EtsyListing = {
  listing_id: number;
  title: string;
  state: string;
  quantity: number;
  url: string;
  updated_timestamp: number;
  price: EtsyMoney;
};

export type EtsyListingPage = {
  count: number;
  results: EtsyListing[];
};

export type EtsyListingPropertyValue = {
  property_id: number;
  property_name?: string | null;
  value_ids?: number[];
  values?: string[];
  scale_id?: number | null;
  scale_name?: string | null;
  value_pairs?: unknown;
};

export type EtsyListingOffering = {
  offering_id: number;
  quantity: number;
  is_enabled: boolean;
  is_deleted?: boolean;
  price: EtsyMoney;
  readiness_state_id?: number | null;
};

export type EtsyListingInventoryProduct = {
  product_id: number;
  sku?: string | null;
  is_deleted?: boolean;
  offerings?: EtsyListingOffering[];
  property_values?: EtsyListingPropertyValue[];
};

export type EtsyListingInventory = {
  products?: EtsyListingInventoryProduct[];
  price_on_property?: number[];
  quantity_on_property?: number[];
  sku_on_property?: number[];
  readiness_state_on_property?: number[] | null;
};

export type EtsyListingWithInventory = {
  listing_id: number;
  inventory?: EtsyListingInventory | null;
};

export type EtsyListingsInventoryBatch = {
  count: number;
  results: EtsyListingWithInventory[];
};

export type EtsyDashboardVariationOption = {
  propertyId: number;
  name: string;
  value: string;
  priceVaries: boolean;
  quantityVaries: boolean;
  skuVaries: boolean;
};

export type EtsyDashboardOffering = {
  productId: number;
  offeringId: number;
  options: EtsyDashboardVariationOption[];
  quantity: number;
  price: number;
  currencyCode: string;
  sku: string | null;
  isEnabled: boolean;
};

export type EtsyDashboardInventory = {
  recordAvailable: boolean;
  hasVariations: boolean;
  priceVaries: boolean;
  quantityVaries: boolean;
  offerings: EtsyDashboardOffering[];
};

export type EtsyDashboardListing = {
  listingId: number;
  title: string;
  state: string;
  quantity: number;
  price: number;
  currencyCode: string;
  url: string;
  lastUpdated: string;
  inventory: EtsyDashboardInventory;
};

export type EtsyDashboardShop = {
  shopId: number;
  shopName: string;
  title: string | null;
  currencyCode: string | null;
  isVacation: boolean;
  activeListingCount: number;
  url: string | null;
  reviewCount: number;
  reviewAverage: number | null;
};

export type EtsyReceiptRefund = {
  created_timestamp?: number | null;
  reason?: string | null;
  status?: string | null;
};

export type EtsyReceipt = {
  receipt_id: number;
  status?: string | null;
  is_paid?: boolean;
  is_canceled?: boolean;
  is_shipped?: boolean;
  create_timestamp?: number | null;
  created_timestamp?: number | null;
  update_timestamp?: number | null;
  updated_timestamp?: number | null;
  refunds?: EtsyReceiptRefund[];
};

export type EtsyReceiptPage = {
  count: number;
  results: EtsyReceipt[];
};

export type EtsyTransactionVariation = {
  property_id?: number | null;
  value_id?: number | null;
  formatted_name?: string | null;
  formatted_value?: string | null;
  question_id?: number | null;
};

export type EtsyTransactionProductData = {
  property_id?: number | null;
  property_name?: string | null;
  values?: string[];
};

export type EtsyReceiptTransaction = {
  transaction_id: number;
  receipt_id: number;
  listing_id?: number | null;
  product_id?: number | null;
  sku?: string | null;
  quantity: number;
  paid_timestamp?: number | null;
  variations?: EtsyTransactionVariation[];
  product_data?: EtsyTransactionProductData[];
};

export type EtsyReceiptTransactionPage = {
  count: number;
  results: EtsyReceiptTransaction[];
};
