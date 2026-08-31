export const ETSY_API_BASE_URL = "https://openapi.etsy.com/v3/application";
export const ETSY_AUTHORIZATION_URL = "https://www.etsy.com/oauth/connect";
export const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
export const ETSY_CONNECTION_ID = "basecampnorthpa";
export const ETSY_EXPECTED_SHOP_NAME = "BaseCampNorthPA";
export const ETSY_READ_ONLY_SCOPES = ["shops_r", "listings_r"] as const;

export type EtsyConfig = {
  apiKey: string;
  sharedSecret: string;
  redirectUri: string;
  encryptionKey: string;
};

function requiredServerEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Server environment variable ${name} is missing.`);
  return value;
}

export function getEtsyConfig(): EtsyConfig {
  const redirectUri = requiredServerEnvironment("ETSY_REDIRECT_URI");
  const parsedRedirect = new URL(redirectUri);

  if (parsedRedirect.protocol !== "https:") {
    throw new Error("ETSY_REDIRECT_URI must be an HTTPS URL registered with Etsy.");
  }

  return {
    apiKey: requiredServerEnvironment("ETSY_API_KEY"),
    sharedSecret: requiredServerEnvironment("ETSY_SHARED_SECRET"),
    redirectUri: parsedRedirect.toString(),
    encryptionKey: requiredServerEnvironment("ETSY_TOKEN_ENCRYPTION_KEY")
  };
}

export function etsyApiKeyHeader(config: EtsyConfig) {
  return `${config.apiKey}:${config.sharedSecret}`;
}
