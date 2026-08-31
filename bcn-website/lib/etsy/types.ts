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

export type EtsyDashboardListing = {
  listingId: number;
  title: string;
  state: string;
  quantity: number;
  price: number;
  currencyCode: string;
  url: string;
  lastUpdated: string;
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
