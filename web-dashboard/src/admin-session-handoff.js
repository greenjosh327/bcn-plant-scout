const ADMIN_HANDOFF_MARKER = "bcn_admin_handoff";
const ADMIN_ACCESS_TOKEN = "bcn_access_token";
const ADMIN_REFRESH_TOKEN = "bcn_refresh_token";
const ALLOWED_ADMIN_ORIGINS = new Set([
  "https://basecampnorthpa.com",
  "https://www.basecampnorthpa.com",
  "https://shop.basecampnorthpa.com",
  "https://scout.basecampnorthpa.com"
]);

function isAllowedAdminUrl(url) {
  const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  return ALLOWED_ADMIN_ORIGINS.has(url.origin) && isAdminPath;
}

export function buildAdminSessionHandoffUrl(targetUrl, session) {
  const url = new URL(targetUrl);

  if (!isAllowedAdminUrl(url)) {
    throw new Error("Admin sessions can only be handed to an approved BCN admin URL.");
  }

  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("The current admin session cannot be handed off.");
  }

  url.hash = new URLSearchParams({
    [ADMIN_HANDOFF_MARKER]: "1",
    [ADMIN_ACCESS_TOKEN]: session.access_token,
    [ADMIN_REFRESH_TOKEN]: session.refresh_token
  }).toString();

  return url.toString();
}

export function consumeAdminSessionHandoff(currentUrl) {
  const url = new URL(currentUrl);
  if (!isAllowedAdminUrl(url)) return null;

  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  if (hash.get(ADMIN_HANDOFF_MARKER) !== "1") return null;

  const accessToken = hash.get(ADMIN_ACCESS_TOKEN) ?? "";
  const refreshToken = hash.get(ADMIN_REFRESH_TOKEN) ?? "";
  url.hash = "";

  return {
    cleanUrl: url.toString(),
    session: accessToken && refreshToken
      ? { access_token: accessToken, refresh_token: refreshToken }
      : null
  };
}
