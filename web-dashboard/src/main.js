import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const app = document.querySelector("#app");
const PLANT_PHOTOS_BUCKET = "plant-photos";
const DASHBOARD_URL = "https://scout.basecampnorthpa.com";
const ADMIN_PATH = "/admin";
const SUPPORT_URL = `${DASHBOARD_URL}/support`;
const DELETE_ACCOUNT_URL = `${DASHBOARD_URL}/delete-account`;
const PRIVACY_POLICY_URL = `${DASHBOARD_URL}/privacy-policy`;
const TERMS_URL = `${DASHBOARD_URL}/terms`;
const ETSY_SHOP_URL = "https://basecampnorthpa.etsy.com";
const BCN_SHOP_URL = "https://shop.basecampnorthpa.com";
const BCN_SHOP_ADMIN_URL = "https://basecampnorthpa.com/admin";
const BCN_ETSY_ADMIN_URL = "https://basecampnorthpa.com/admin/etsy";
const BCN_FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61581856435743";
const APP_STORE_URL = "https://apps.apple.com/us/app/bcn-plant-scout/id6784878818";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.basecampnorth.bcnplantscout";
const BASE_CAMP_NORTH_URL = "https://basecampnorthpa.com";
const OBSERVATION_SELECT_COLUMNS = [
  "id",
  "user_id",
  "owner_id",
  "privacy_level",
  "sync_status",
  "sync_error",
  "last_synced_at",
  "created_at",
  "updated_at",
  "deleted_at",
  "common_name",
  "scientific_name",
  "other_names",
  "confidence_score",
  "identification_status",
  "identification_error",
  "identified_at",
  "user_confirmed",
  "latitude",
  "longitude",
  "accuracy_meters",
  "observed_at",
  "photo_file_name",
  "photo_storage_path",
  "notes",
  "return_date",
  "reminder_lead_days",
  "reminder_scheduled_for",
  "gather_notes",
  "collection_interests",
  "collection_status"
].join(", ");
const PHOTO_SELECT_COLUMNS = [
  "id",
  "observation_id",
  "user_id",
  "storage_path",
  "file_name",
  "photo_role",
  "added_at",
  "sync_status",
  "sync_error"
].join(", ");
const DASHBOARD_CARD_PAGE_SIZE = 24;
const DASHBOARD_REFRESH_DEBOUNCE_MS = 1500;
const SIGNED_PHOTO_URL_EXPIRES_SECONDS = 60 * 60 * 24;
const SIGNED_PHOTO_URL_RENEW_BUFFER_MS = 5 * 60 * 1000;
const SIGNED_PHOTO_URL_SESSION_KEY = "bcnPlantScout.signedPhotoUrls.v1";
const PHOTO_TRANSFORM_FAILURE_SESSION_KEY =
  "bcnPlantScout.photoTransformsUnavailable.v1";
const PHOTO_URL_VARIANTS = {
  thumb: {
    transform: {
      width: 640,
      height: 360,
      resize: "cover",
      quality: 70
    }
  },
  detail: {
    transform: {
      width: 1400,
      height: 1050,
      resize: "contain",
      quality: 82
    }
  },
  card: {
    transform: {
      width: 1080,
      height: 620,
      resize: "cover",
      quality: 82
    }
  }
};

const FEATURE_ITEMS = [
  {
    title: "Plant Identification",
    body: "Identify plants from photos using AI."
  },
  {
    title: "GPS Plant Mapping",
    body: "Automatically save precise GPS locations. Never lose another great tree."
  },
  {
    title: "Return Later",
    body: "Set return dates for fruit, nuts, berries, seeds, or cuttings."
  },
  {
    title: "Field Notes",
    body: "Record habitat, ownership, collection notes, and observations."
  },
  {
    title: "Build Your Plant Library",
    body: "Organize thousands of plants by species, interest, and status."
  },
  {
    title: "GIS Export",
    body: "Export observations as CSV, GeoJSON, or ZIP. Perfect for GIS workflows."
  }
];

const SCREENSHOTS = [
  {
    title: "Home Dashboard",
    src: "/images/screenshots/home-dashboard.jpg",
    alt: "BCN Plant Scout home dashboard showing saved plants and app stats"
  },
  {
    title: "Plant Detail: Black Cherry",
    src: "/images/screenshots/plant-detail-black-cherry.jpg",
    alt: "Black cherry plant detail with photo, ID score, GPS accuracy, and actions"
  },
  {
    title: "Plant Detail: Black Chokeberry",
    src: "/images/screenshots/plant-detail-black-chokeberry.jpg",
    alt: "Black chokeberry plant detail with alternate names and saved field metadata"
  },
  {
    title: "Plant Map",
    src: "/images/screenshots/plant-map.jpg",
    alt: "Plant map showing saved locations and selected plant details"
  },
  {
    title: "Plant Identification",
    src: "/images/screenshots/plant-identification.jpg",
    alt: "Plant identification screen with AI suggestion and alternate species choices"
  },
  {
    title: "About BCN",
    src: "/images/screenshots/about-bcn.jpg",
    alt: "About BCN screen explaining the Base Camp North story"
  }
];

const FAQ_ITEMS = [
  {
    question: "Does BCN Plant Scout work offline?",
    answer: "Yes. Save plants in the field even without service. Sync later when connected."
  },
  {
    question: "Does it identify plants?",
    answer:
      "Yes. Take or select a photo and receive AI-powered plant identification suggestions."
  },
  {
    question: "Can I save GPS locations?",
    answer: "Yes. Every plant can be saved with precise GPS coordinates."
  },
  {
    question: "Can I export my data?",
    answer: "Yes. Export your observations as CSV, GeoJSON, or ZIP."
  },
  {
    question: "Is my data private?",
    answer:
      "You control your data. Choose whether observations remain private or are shared with Base Camp North."
  }
];

const PERFECT_FOR = [
  "Native plant enthusiasts",
  "Foragers",
  "Hunters",
  "Tree nurseries",
  "Forestry professionals",
  "Land managers",
  "GIS users",
  "Restoration projects"
];

let supabase = null;
let session = null;
let isAdmin = false;
let dashboardMode = getInitialDashboardMode();
let observations = [];
let photosByObservation = new Map();
let signedPhotoUrls = new Map();
let signedPhotoUrlCache = restoreSignedPhotoUrlCache();
let signedPhotoUrlRequests = new Map();
let photoTransformsUnavailable = restorePhotoTransformFailureFlag();
let photoTransformsAvailable = photoTransformsUnavailable ? false : null;
let photoTransformProbePromise = null;
let dashboardLoadPromise = null;
let lastDashboardLoadAt = 0;
let visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
let lazyImageObserver = null;
let activeFilters = {
  search: "",
  status: "all",
  interest: "all",
  privacy: "all",
  returnWindow: "all",
  user: "all",
  advanced: false
};
let map = null;
let markerLayer = null;
let selectedRecordId = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

boot();

async function boot() {
  if (!supabase) {
    renderMissingConfig();
    return;
  }

  const { data } = await supabase.auth.getSession();
  session = data.session;

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    if (!session) {
      isAdmin = false;
      dashboardMode = getInitialDashboardMode();
      activeFilters.user = "all";
    }
    render();
    if (session) {
      loadDashboard();
    }
  });

  render();
  if (session) {
    await loadDashboard();
  }
}

function getInitialDashboardMode() {
  return window.location.pathname === ADMIN_PATH ? "admin" : "member";
}

function renderMissingConfig() {
  app.innerHTML = `
    <main class="page narrow">
      <section class="panel">
        <p class="eyebrow">Setup needed</p>
        <h1>Supabase environment variables are missing.</h1>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in Vercel or <code>.env.local</code>.</p>
      </section>
    </main>
  `;
}

function render() {
  if (!session) {
    renderSignIn();
    return;
  }

  renderDashboard();
  hydrateDashboard();
}

function renderSignIn() {
  app.innerHTML = `
    <main class="marketing-page simple-marketing">
      <section id="download" class="simple-hero">
        <div class="simple-hero-copy">
          <p class="eyebrow">Base Camp North</p>
          <h1>BCN Plant Scout</h1>
          <p class="hero-lede">A simple field app for plant photos, GPS locations, AI plant ID, return dates, and notes you can find again later.</p>
          <p class="availability-note">Available now for iPhone and Android.</p>
          <div class="hero-actions app-download-actions">
            ${renderStoreBadge(APP_STORE_URL, "/images/download-on-app-store.svg", "Download on the App Store")}
            ${renderStoreBadge(PLAY_STORE_URL, "/images/get-it-on-google-play.png", "Get it on Google Play")}
            <a class="secondary-cta" href="#sign-in">Sign In</a>
          </div>
        </div>
        <aside class="logo-detail-card" aria-label="BCN Plant Scout app details">
          <div class="logo-detail-brand">
            <img class="brand-mark" src="/images/bcn-logo-with-text.png" alt="Base Camp North" />
          </div>
          <div class="app-preview-frame">
            <img src="/images/plant-scout-hero.png" alt="BCN Plant Scout app preview showing a black cherry plant record" />
          </div>
        </aside>
      </section>

      <section class="dashboard-simple-panel panel">
        <div>
          <p class="eyebrow">Web dashboard</p>
          <h2>Sign in here after using the app.</h2>
          <p>Use the phone app in the field. When your records sync, sign in here to review your saved plants, photos, map points, return dates, and notes on a bigger screen.</p>
        </div>
        <div class="dashboard-simple-actions">
          <a class="secondary-cta" href="#sign-in">Sign In to Dashboard</a>
        </div>
      </section>

      <section id="sign-in" class="login-shell simple-login">
        <div class="panel login-panel">
          <p class="eyebrow">Dashboard access</p>
          <h2>Sign In</h2>
          <p class="muted">Use the same account as the mobile app to open your synced field dashboard.</p>
          <button id="google-sign-in" class="google-button full">Sign In With Google</button>
          <div class="login-divider"><span>or use email</span></div>
          <form id="email-form" class="form">
            <label>
              Email
              <input id="email" type="email" autocomplete="email" required />
            </label>
            <label>
              Password
              <input id="password" type="password" autocomplete="current-password" required />
            </label>
            <button type="submit">Sign In</button>
          </form>
          <p id="auth-message" class="message"></p>
        </div>
      </section>

      <section class="public-info-panel simple-public-links panel">
        <div>
          <p class="eyebrow">Help</p>
          <h2>Support and account links.</h2>
          <p>Support, privacy details, terms, and account deletion stay here for app store review and user help.</p>
        </div>
        <div class="public-link-actions">
          <a class="store-button text-store-button" href="${SUPPORT_URL}">Support</a>
          <a class="store-button secondary-store text-store-button" href="${DELETE_ACCOUNT_URL}">Delete Account</a>
          <a class="store-button secondary-store text-store-button" href="${PRIVACY_POLICY_URL}">Privacy Policy</a>
          <a class="store-button secondary-store text-store-button" href="${TERMS_URL}">Terms</a>
        </div>
      </section>

      <footer class="marketing-footer">
        <div>
          <p class="eyebrow">BCN Plant Scout</p>
          <h2>Available now for field work.</h2>
          <div class="footer-badges">
            ${renderStoreBadge(APP_STORE_URL, "/images/download-on-app-store.svg", "Download on the App Store")}
            ${renderStoreBadge(PLAY_STORE_URL, "/images/get-it-on-google-play.png", "Get it on Google Play")}
          </div>
        </div>
        <nav aria-label="Footer">
          <a href="${SUPPORT_URL}">Support</a>
          <a href="${PRIVACY_POLICY_URL}">Privacy Policy</a>
          <a href="${TERMS_URL}">Terms</a>
          <a href="${BCN_SHOP_URL}">BCN Shop</a>
          <a href="${BCN_FACEBOOK_URL}" target="_blank" rel="noreferrer">Facebook</a>
          <a href="${BASE_CAMP_NORTH_URL}">Base Camp North</a>
        </nav>
      </footer>
    </main>
  `;

  document.querySelector("#email-form").addEventListener("submit", signInWithEmail);
  document.querySelector("#google-sign-in").addEventListener("click", signInWithGoogle);
}

function renderStoreBadge(href, src, alt) {
  return `
    <a class="store-badge-link" href="${href}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(alt)}">
      <img src="${src}" alt="${escapeHtml(alt)}" />
    </a>
  `;
}

function renderFeatureCard(feature) {
  return `
    <article class="feature-card">
      <h3>${escapeHtml(feature.title)}</h3>
      <p>${escapeHtml(feature.body)}</p>
    </article>
  `;
}

function renderScreenshot(item) {
  return `
    <article class="phone-shot">
      <div class="phone-frame">
        <span class="phone-speaker" aria-hidden="true"></span>
        <img src="${item.src}" alt="${escapeHtml(item.alt)}" loading="lazy" />
      </div>
      <h3>${escapeHtml(item.title)}</h3>
    </article>
  `;
}

function renderFaqItem(item) {
  return `
    <article class="faq-card">
      <h3>${escapeHtml(item.question)}</h3>
      <p>${escapeHtml(item.answer)}</p>
    </article>
  `;
}

function renderAudienceBadge(label) {
  return `<span>${escapeHtml(label)}</span>`;
}

async function signInWithEmail(event) {
  event.preventDefault();
  setMessage("auth-message", "Signing in...");
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    setMessage("auth-message", error.message, true);
  }
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectUrl()
    }
  });

  if (error) {
    setMessage("auth-message", error.message, true);
  }
}

function getAuthRedirectUrl() {
  if (window.location.pathname === ADMIN_PATH) {
    return new URL(ADMIN_PATH, window.location.origin).toString();
  }

  return window.location.origin;
}

async function shareDashboardLink() {
  const shareData = {
    title: "BCN Plant Scout Dashboard",
    text: "Open the BCN Plant Scout web dashboard to review synced plant photos, map points, return dates, and collection notes.",
    url: DASHBOARD_URL
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      setMessage("share-link-message", "Dashboard link ready to send.");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        setMessage("share-link-message", "Share canceled.");
        return;
      }
    }
  }

  emailDashboardLink();
}

function emailDashboardLink() {
  const subject = encodeURIComponent("BCN Plant Scout dashboard link");
  const body = encodeURIComponent(
    `Here is the BCN Plant Scout web dashboard:\n\n${DASHBOARD_URL}\n\nUse the same account as the mobile app to review synced plant records, photos, map points, return dates, and collection notes.`
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  setMessage("share-link-message", "Opening an email draft with the dashboard link.");
}

async function copyDashboardLink() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(DASHBOARD_URL);
      setMessage("share-link-message", "Dashboard link copied.");
      return;
    }

    throw new Error("Clipboard is unavailable.");
  } catch {
    window.prompt("Copy the BCN Plant Scout dashboard link:", DASHBOARD_URL);
    setMessage("share-link-message", "Copy the dashboard link from the prompt.");
  }
}

function renderDashboard() {
  resetMap();
  const adminMode = isAdminMode();
  const dashboardRecords = getDashboardRecords();
  const signedInLabel = escapeHtml(session.user.email ?? "field user");
  app.innerHTML = `
    <main class="page">
      <header class="topbar">
        <div>
          <p class="eyebrow">Base Camp North</p>
          <h1>BCN Plant Scout Dashboard</h1>
          <p class="muted">${
            isAdmin
              ? `${adminMode ? "Admin view" : "My records"} for ${signedInLabel}`
              : `Signed in as ${signedInLabel}`
          }</p>
        </div>
        <div class="topbar-actions">
          ${
            isAdmin
              ? `
                <div class="mode-switch" aria-label="Dashboard mode">
                  <button id="mode-member" class="mode-button ${
                    !adminMode ? "active" : ""
                  }" type="button">My Records</button>
                  <button id="mode-admin" class="mode-button ${
                    adminMode ? "active" : ""
                  }" type="button">Admin</button>
                </div>
              `
              : ""
          }
          <button id="sign-out" class="secondary">Sign Out</button>
        </div>
      </header>

      ${
        isAdmin
          ? `
            <nav class="admin-switcher panel" aria-label="BCN admin tools">
              <div>
                <p class="eyebrow">Admin tools</p>
                <p class="muted">Jump between the Base Camp North admin areas.</p>
              </div>
              <div class="admin-switcher-links">
                <a class="admin-switcher-link" href="${BCN_SHOP_ADMIN_URL}">Shop Admin</a>
                <a class="admin-switcher-link active" href="${DASHBOARD_URL}${ADMIN_PATH}"${
                  adminMode ? ' aria-current="page"' : ""
                }>Scout Admin</a>
                <a class="admin-switcher-link" href="${BCN_ETSY_ADMIN_URL}">Etsy</a>
              </div>
            </nav>
          `
          : ""
      }

      <section class="stats-grid" id="stats"></section>
      ${adminMode ? `<section class="admin-console panel" id="admin-console"></section>` : ""}

      <section class="toolbar panel">
        <label>
          Search
          <input id="search" type="search" placeholder="Plant, notes, status, tags..." value="${escapeHtml(activeFilters.search)}" />
        </label>
        <label>
          Status
          <select id="status-filter">${renderOptions(["all", ...uniqueValues(dashboardRecords.map((item) => item.collection_status))], activeFilters.status)}</select>
        </label>
        <label>
          Interest
          <select id="interest-filter">${renderOptions(["all", ...uniqueValues(dashboardRecords.flatMap((item) => item.collection_interests ?? []))], activeFilters.interest)}</select>
        </label>
        <label>
          Privacy
          <select id="privacy-filter">${renderOptions(["all", ...uniqueValues(dashboardRecords.map((item) => item.privacy_level))], activeFilters.privacy)}</select>
        </label>
        <label>
          Return
          <select id="return-filter">${renderOptions(["all", "ready now", "overdue", "next 7 days", "next 30 days", "no date"], activeFilters.returnWindow)}</select>
        </label>
        ${
          adminMode
            ? `
              <label>
                Member
                <select id="user-filter">${renderUserOptions()}</select>
              </label>
            `
            : ""
        }
        <label class="toggle-row">
          <input id="advanced-toggle" type="checkbox" ${activeFilters.advanced ? "checked" : ""} />
          <span>Show Advanced</span>
        </label>
        <button id="refresh">Refresh</button>
      </section>

      <section class="admin-panel panel ${activeFilters.advanced ? "" : "hidden"}" id="admin-snapshot"></section>

      <section class="map-panel panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Private Map</p>
            <h2>Synced Plant Locations</h2>
          </div>
          <p class="muted">Exact GPS is visible only after sign-in.</p>
        </div>
        <div id="map"></div>
      </section>

      <section class="section-heading">
        <div>
          <p class="eyebrow">Return Planning</p>
          <h2>Return Soon</h2>
        </div>
      </section>
      <section class="return-grid" id="return-soon"></section>

      <section class="section-heading">
        <div>
          <p class="eyebrow">Field Records</p>
          <h2 id="record-count">Loading records...</h2>
        </div>
      </section>
      <section class="card-grid" id="records"></section>
    </main>
    <div id="detail-modal"></div>
  `;
}

function hydrateDashboard() {
  document.querySelector("#sign-out").addEventListener("click", () => supabase.auth.signOut());
  const memberModeButton = document.querySelector("#mode-member");
  const adminModeButton = document.querySelector("#mode-admin");
  if (memberModeButton) {
    memberModeButton.addEventListener("click", () => setDashboardMode("member"));
  }
  if (adminModeButton) {
    adminModeButton.addEventListener("click", () => setDashboardMode("admin"));
  }
  document
    .querySelector("#refresh")
    .addEventListener("click", () => loadDashboard({ force: true }));
  document.querySelector("#search").addEventListener("input", (event) => {
    activeFilters.search = event.target.value;
    visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
    redrawDashboardData();
  });
  document.querySelector("#status-filter").addEventListener("change", (event) => {
    activeFilters.status = event.target.value;
    visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
    redrawDashboardData();
  });
  document.querySelector("#interest-filter").addEventListener("change", (event) => {
    activeFilters.interest = event.target.value;
    visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
    redrawDashboardData();
  });
  document.querySelector("#privacy-filter").addEventListener("change", (event) => {
    activeFilters.privacy = event.target.value;
    visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
    redrawDashboardData();
  });
  document.querySelector("#return-filter").addEventListener("change", (event) => {
    activeFilters.returnWindow = event.target.value;
    visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
    redrawDashboardData();
  });
  const userFilter = document.querySelector("#user-filter");
  if (userFilter) {
    userFilter.addEventListener("change", (event) => {
      activeFilters.user = event.target.value;
      visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
      redrawDashboardData();
    });
  }
  document.querySelector("#advanced-toggle").addEventListener("change", (event) => {
    activeFilters.advanced = event.target.checked;
    renderDashboard();
    hydrateDashboard();
    redrawDashboardData();
  });
}

function setDashboardMode(nextMode) {
  if (!isAdmin || dashboardMode === nextMode) return;

  dashboardMode = nextMode;
  activeFilters.user = "all";
  selectedRecordId = null;
  visibleRecordLimit = DASHBOARD_CARD_PAGE_SIZE;
  renderDashboard();
  hydrateDashboard();
  redrawDashboardData();
}

async function loadDashboard(options = {}) {
  if (dashboardLoadPromise) {
    return dashboardLoadPromise;
  }

  const now = Date.now();
  if (
    !options.force &&
    observations.length > 0 &&
    now - lastDashboardLoadAt < DASHBOARD_REFRESH_DEBOUNCE_MS
  ) {
    redrawDashboardData();
    return;
  }

  dashboardLoadPromise = loadDashboardData().finally(() => {
    dashboardLoadPromise = null;
  });

  return dashboardLoadPromise;
}

async function loadDashboardData() {
  setRecordsLoading();
  await loadAdminStatus();
  if (!isAdmin) {
    dashboardMode = "member";
  }

  const { data: observationRows, error: observationError } = await supabase
    .from("observations")
    .select(OBSERVATION_SELECT_COLUMNS)
    .is("deleted_at", null)
    .order("observed_at", { ascending: false });

  if (observationError) {
    renderError(observationError.message);
    return;
  }

  const visibleObservationIds = new Set((observationRows ?? []).map((record) => record.id));
  const { photoRows, error: photoError } = await loadPhotoRowsForObservations([
    ...visibleObservationIds
  ]);

  if (photoError) {
    renderError(photoError.message);
    return;
  }

  observations = observationRows ?? [];
  visibleRecordLimit = Math.max(
    DASHBOARD_CARD_PAGE_SIZE,
    Math.min(visibleRecordLimit, observations.length || DASHBOARD_CARD_PAGE_SIZE)
  );
  const adminMode = isAdminMode();
  const dashboardRecords = getDashboardRecords();
  if (!adminMode || !dashboardRecords.some((record) => getRecordUserId(record) === activeFilters.user)) {
    activeFilters.user = "all";
  }
  const visiblePhotoRows = (photoRows ?? []).filter((photo) =>
    visibleObservationIds.has(photo.observation_id)
  );
  photosByObservation = groupBy(visiblePhotoRows, "observation_id");
  signedPhotoUrls = createCachedThumbnailUrlMap(visiblePhotoRows);
  lastDashboardLoadAt = Date.now();
  renderDashboard();
  hydrateDashboard();
  redrawDashboardData();
}

async function loadAdminStatus() {
  isAdmin = false;
  if (!session?.user?.id) return;

  const { data, error } = await supabase
    .from("bcn_admins")
    .select("user_id")
    .eq("user_id", session.user.id)
    .limit(1);

  if (error) {
    console.warn("Admin status check failed:", error.message);
    return;
  }

  isAdmin = (data ?? []).length > 0;
}

function setRecordsLoading() {
  const records = document.querySelector("#records");
  if (records) {
    records.innerHTML = `<article class="panel"><p class="muted">Loading synced field records...</p></article>`;
  }
}

async function loadPhotoRowsForObservations(observationIds) {
  if (observationIds.length === 0) {
    return { photoRows: [], error: null };
  }

  const photoRows = [];
  for (let index = 0; index < observationIds.length; index += 100) {
    const idChunk = observationIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from("observation_photos")
      .select(PHOTO_SELECT_COLUMNS)
      .in("observation_id", idChunk)
      .order("added_at", { ascending: true });

    if (error) {
      return { photoRows: [], error };
    }
    photoRows.push(...(data ?? []));
  }

  return { photoRows, error: null };
}

function createCachedThumbnailUrlMap(photoRows) {
  return new Map(
    photoRows
      .map((photo) => [photo.id, getCachedSignedPhotoUrl(photo, "thumb")])
      .filter((entry) => entry[1])
  );
}

function redrawDashboardData() {
  const filtered = getFilteredObservations();
  renderStats(filtered);
  renderAdminConsole(filtered);
  renderReturnSoon(filtered);
  renderRecords(filtered);
  renderMap(filtered);
  renderDetailModal();
  hydratePhotoPlaceholders();
}

function renderPhotoShell(photo, alt, variant, options = {}) {
  const cachedUrl = getCachedSignedPhotoUrl(photo, variant);
  if (variant === "thumb" && cachedUrl) {
    signedPhotoUrls.set(photo.id, cachedUrl);
  }
  const tag = options.link ? "a" : "div";
  const href = options.link ? ` href="${cachedUrl ? escapeHtml(cachedUrl) : "#"}" target="_blank" rel="noreferrer"` : "";
  const content = cachedUrl
    ? `<img src="${escapeHtml(cachedUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`
    : `<div class="photo-placeholder">Loading photo</div>`;

  return `<${tag} class="photo-shell${options.link ? " photo-link" : ""}"${href} data-photo-id="${escapeHtml(photo.id)}" data-photo-variant="${escapeHtml(variant)}" data-photo-alt="${escapeHtml(alt)}">${content}</${tag}>`;
}

function hydratePhotoPlaceholders(root = document) {
  const shells = [...root.querySelectorAll("[data-photo-id][data-photo-variant]")].filter(
    (shell) => shell.dataset.photoHydrated !== "true"
  );
  if (shells.length === 0) return;

  if ("IntersectionObserver" in window) {
    if (!lazyImageObserver) {
      lazyImageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            lazyImageObserver.unobserve(entry.target);
            hydrateOnePhotoShell(entry.target);
          });
        },
        { rootMargin: "350px 0px" }
      );
    }
    shells.forEach((shell) => lazyImageObserver.observe(shell));
    return;
  }

  shells.forEach(hydrateOnePhotoShell);
}

async function hydrateOnePhotoShell(shell) {
  if (shell.dataset.photoHydrated === "true") return;
  shell.dataset.photoHydrated = "true";

  const photo = findPhotoById(shell.dataset.photoId);
  if (!photo) {
    shell.innerHTML = `<div class="photo-placeholder">Photo unavailable</div>`;
    return;
  }

  try {
    const variant = shell.dataset.photoVariant || "thumb";
    const signedUrl = await ensureSignedPhotoUrl(photo, variant);
    if (!signedUrl || !shell.isConnected) return;

    if (variant === "thumb") {
      signedPhotoUrls.set(photo.id, signedUrl);
    }
    if (shell.tagName === "A") {
      shell.setAttribute("href", signedUrl);
    }
    shell.innerHTML = `<img src="${escapeHtml(signedUrl)}" alt="${escapeHtml(
      shell.dataset.photoAlt || "Plant photo"
    )}" loading="lazy" decoding="async" />`;
  } catch (error) {
    console.warn("Photo URL load failed:", getErrorMessage(error));
    shell.innerHTML = `<div class="photo-placeholder">Photo unavailable</div>`;
  }
}

async function openPhoto(photoId) {
  const photo = findPhotoById(photoId);
  if (!photo) return;
  const nextWindow = window.open("", "_blank", "noopener,noreferrer");

  try {
    const signedUrl = await ensureSignedPhotoUrl(photo, "detail");
    if (signedUrl) {
      if (nextWindow) {
        nextWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      nextWindow?.close();
    }
  } catch (error) {
    nextWindow?.close();
    window.alert(`Photo failed to open: ${getErrorMessage(error)}`);
  }
}

function findPhotoById(photoId) {
  if (!photoId) return null;
  for (const photos of photosByObservation.values()) {
    const match = photos.find((photo) => photo.id === photoId);
    if (match) return match;
  }
  return null;
}

async function ensureSignedPhotoUrl(photo, variant = "thumb") {
  if (!photo?.storage_path) return null;

  const cachedUrl = getCachedSignedPhotoUrl(photo, variant);
  if (cachedUrl) return cachedUrl;

  const cacheKey = getSignedPhotoUrlCacheKey(photo, variant);
  if (signedPhotoUrlRequests.has(cacheKey)) {
    return signedPhotoUrlRequests.get(cacheKey);
  }

  const request = createSignedPhotoUrl(photo, variant).finally(() => {
    signedPhotoUrlRequests.delete(cacheKey);
  });
  signedPhotoUrlRequests.set(cacheKey, request);
  return request;
}

async function createSignedPhotoUrl(photo, variant) {
  const cacheKey = getSignedPhotoUrlCacheKey(photo, variant);
  const variantOptions = PHOTO_URL_VARIANTS[variant];
  let transformOptions;

  if (variantOptions?.transform && !photoTransformsUnavailable) {
    if (photoTransformsAvailable === true) {
      transformOptions = variantOptions;
    } else if (photoTransformProbePromise) {
      await photoTransformProbePromise;
      transformOptions = photoTransformsAvailable === true ? variantOptions : undefined;
    } else if (photoTransformsAvailable !== false) {
      transformOptions = variantOptions;
    }
  }

  const signedUrlRequest = supabase.storage
    .from(PLANT_PHOTOS_BUCKET)
    .createSignedUrl(
      photo.storage_path,
      SIGNED_PHOTO_URL_EXPIRES_SECONDS,
      transformOptions
    );

  if (transformOptions?.transform && photoTransformsAvailable !== true) {
    photoTransformProbePromise = signedUrlRequest
      .then(({ error }) => {
        if (error) {
          markPhotoTransformsUnavailable();
        } else {
          photoTransformsAvailable = true;
        }
      })
      .catch(() => {
        markPhotoTransformsUnavailable();
      })
      .finally(() => {
        photoTransformProbePromise = null;
      });
  }

  const { data, error } = await signedUrlRequest;

  let signedUrl = data?.signedUrl ?? null;
  if (error && transformOptions?.transform) {
    console.warn("Transformed photo URL failed, falling back to original:", error.message);
    markPhotoTransformsUnavailable();
    const fallback = await supabase.storage
      .from(PLANT_PHOTOS_BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_PHOTO_URL_EXPIRES_SECONDS);
    if (fallback.error) {
      throw fallback.error;
    }
    signedUrl = fallback.data?.signedUrl ?? null;
  } else if (error) {
    throw error;
  }

  if (!signedUrl) {
    throw new Error("Signed photo URL was not returned.");
  }

  signedPhotoUrlCache.set(cacheKey, {
    signedUrl,
    expiresAt: Date.now() + SIGNED_PHOTO_URL_EXPIRES_SECONDS * 1000
  });
  if (variant === "thumb") {
    signedPhotoUrls.set(photo.id, signedUrl);
  }
  persistSignedPhotoUrlCache();
  return signedUrl;
}

function getCachedSignedPhotoUrl(photo, variant) {
  if (!photo?.storage_path) return null;
  const cacheKey = getSignedPhotoUrlCacheKey(photo, variant);
  const cached = signedPhotoUrlCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now() + SIGNED_PHOTO_URL_RENEW_BUFFER_MS) {
    signedPhotoUrlCache.delete(cacheKey);
    persistSignedPhotoUrlCache();
    return null;
  }

  return cached.signedUrl;
}

function getSignedPhotoUrlCacheKey(photo, variant) {
  return `${variant}:${photo.storage_path}`;
}

function clearSignedPhotoUrlCache(photo) {
  signedPhotoUrls.delete(photo.id);
  Object.keys(PHOTO_URL_VARIANTS).forEach((variant) => {
    signedPhotoUrlCache.delete(getSignedPhotoUrlCacheKey(photo, variant));
  });
  persistSignedPhotoUrlCache();
}

function restoreSignedPhotoUrlCache() {
  if (typeof sessionStorage === "undefined") {
    return new Map();
  }

  try {
    const stored = sessionStorage.getItem(SIGNED_PHOTO_URL_SESSION_KEY);
    if (!stored) return new Map();
    const now = Date.now() + SIGNED_PHOTO_URL_RENEW_BUFFER_MS;
    return new Map(
      JSON.parse(stored).filter((entry) => entry?.[1]?.signedUrl && entry[1].expiresAt > now)
    );
  } catch {
    return new Map();
  }
}

function restorePhotoTransformFailureFlag() {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  return sessionStorage.getItem(PHOTO_TRANSFORM_FAILURE_SESSION_KEY) === "true";
}

function persistPhotoTransformFailureFlag() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(PHOTO_TRANSFORM_FAILURE_SESSION_KEY, "true");
  } catch {
    // Best-effort browser session flag only.
  }
}

function markPhotoTransformsUnavailable() {
  photoTransformsUnavailable = true;
  photoTransformsAvailable = false;
  persistPhotoTransformFailureFlag();
}

function persistSignedPhotoUrlCache() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  try {
    const now = Date.now() + SIGNED_PHOTO_URL_RENEW_BUFFER_MS;
    const entries = [...signedPhotoUrlCache.entries()].filter(
      (entry) => entry?.[1]?.signedUrl && entry[1].expiresAt > now
    );
    sessionStorage.setItem(SIGNED_PHOTO_URL_SESSION_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort browser cache only.
  }
}

function getFilteredObservations() {
  const adminMode = isAdminMode();
  const dashboardRecords = getDashboardRecords();
  const search = activeFilters.search.trim().toLowerCase();

  return dashboardRecords.filter((item) => {
    const interests = item.collection_interests ?? [];
    const haystack = [
      item.common_name,
      item.scientific_name,
      item.notes,
      item.gather_notes,
      item.collection_status,
      item.privacy_level,
      adminMode ? getRecordUserId(item) : "",
      ...(item.other_names ?? []),
      ...(item.tags ?? []),
      ...interests
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!search || haystack.includes(search)) &&
      (activeFilters.status === "all" || item.collection_status === activeFilters.status) &&
      (activeFilters.interest === "all" || interests.includes(activeFilters.interest)) &&
      (activeFilters.privacy === "all" || item.privacy_level === activeFilters.privacy) &&
      (!adminMode || activeFilters.user === "all" || getRecordUserId(item) === activeFilters.user) &&
      matchesReturnFilter(item, activeFilters.returnWindow)
    );
  });
}

function renderStats(filtered) {
  const adminMode = isAdminMode();
  const stats = [
    [adminMode ? "Matching" : "Records", filtered.length],
    ["Photos", filtered.reduce((sum, item) => sum + (photosByObservation.get(item.id)?.length ?? 0), 0)],
    ...(adminMode ? [["Members", uniqueValues(filtered.map(getRecordUserId)).length]] : []),
    ["Ready now", filtered.filter((item) => item.collection_status === "ready now").length],
    ["Return later", filtered.filter((item) => item.collection_status === "return later").length],
    ["Private", filtered.filter((item) => item.privacy_level === "private").length],
    ["Shared with BCN", filtered.filter((item) => item.privacy_level === "share with BCN").length]
  ];

  document.querySelector("#stats").innerHTML = stats
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <strong>${value}</strong>
          <span>${label}</span>
        </article>
      `
    )
    .join("");

  renderAdminSnapshot(filtered);
}

function renderAdminConsole(filtered) {
  const container = document.querySelector("#admin-console");
  if (!container || !isAdminMode()) return;

  const memberSummaries = getMemberSummaries(observations);
  const topPlants = getTopCounts(
    observations.map((record) => record.common_name || record.scientific_name || "Unknown plant"),
    8
  );
  const recentRecords = [...observations]
    .sort((a, b) => getRecordTime(b) - getRecordTime(a))
    .slice(0, 8);
  const totalPhotos = countPhotosForRecords(observations);
  const returnNext30 = observations.filter((record) => matchesReturnFilter(record, "next 30 days")).length;
  const failedSyncs = observations.filter((record) => record.sync_status === "sync failed").length;
  const recordsWithoutPhotos = observations.filter((record) => (photosByObservation.get(record.id)?.length ?? 0) === 0).length;
  const recordsWithoutGps = observations.filter((record) => !hasCoordinates(record)).length;
  const addedLast7 = observations.filter((record) => {
    const timestamp = getRecordTime(record, "created_at");
    return timestamp > 0 && Date.now() - timestamp <= 7 * 86400000;
  }).length;

  container.innerHTML = `
    <div class="section-heading tight-heading">
      <div>
        <p class="eyebrow">Admin Console</p>
        <h2>System Overview</h2>
      </div>
      <p class="muted">Visible only to accounts listed in <code>bcn_admins</code>.</p>
    </div>

    <div class="admin-metrics">
      ${[
        ["Total plants", observations.length],
        ["Active members", memberSummaries.length],
        ["Total photos", totalPhotos],
        ["Added last 7 days", addedLast7],
        ["Return next 30", returnNext30],
        ["Sync issues", failedSyncs],
        ["No photos", recordsWithoutPhotos],
        ["No GPS", recordsWithoutGps]
      ]
        .map(
          ([label, value]) => `
            <div class="admin-metric">
              <strong>${value}</strong>
              <span>${label}</span>
            </div>
          `
        )
        .join("")}
    </div>

    <div class="admin-layout">
      <section class="admin-block">
        <div class="admin-block-heading">
          <h3>Top Plants</h3>
          <span>${topPlants.length} groups</span>
        </div>
        ${renderAdminList(topPlants, "No plant records yet.", ({ label, count }) => `
          <li>
            <span>${escapeHtml(label)}</span>
            <strong>${count}</strong>
          </li>
        `)}
      </section>

      <section class="admin-block">
        <div class="admin-block-heading">
          <h3>Member Activity</h3>
          <span>${memberSummaries.length} members</span>
        </div>
        ${renderAdminList(memberSummaries.slice(0, 8), "No member records yet.", (member) => `
          <li>
            <span>
              <strong>${escapeHtml(formatMemberLabel(member.userId))}</strong>
              <small>${member.count} plants, ${member.photos} photos, latest ${escapeHtml(formatDateFromTime(member.latestAt))}</small>
            </span>
            <em>${member.readyNow} ready</em>
          </li>
        `)}
      </section>

      <section class="admin-block">
        <div class="admin-block-heading">
          <h3>Recent Records</h3>
          <span>${filtered.length} matching filters</span>
        </div>
        ${renderAdminList(recentRecords, "No recent records yet.", (record) => `
          <li>
            <span>
              <strong>${escapeHtml(record.common_name || "Unknown plant")}</strong>
              <small>${escapeHtml(formatMemberLabel(getRecordUserId(record)))} | ${escapeHtml(formatDate(record.observed_at))}</small>
            </span>
            <em>${escapeHtml(record.collection_status ?? "unknown")}</em>
          </li>
        `)}
      </section>
    </div>
  `;
}

function renderAdminSnapshot(filtered) {
  const container = document.querySelector("#admin-snapshot");
  if (!container) return;

  const userCount = uniqueValues(filtered.map(getRecordUserId)).length;
  const photoCount = filtered.reduce(
    (sum, item) => sum + (photosByObservation.get(item.id)?.length ?? 0),
    0
  );
  const failedSyncs = filtered.filter((item) => item.sync_status === "sync failed").length;
  const pendingSyncs = filtered.filter((item) =>
    ["pending upload", "local only"].includes(item.sync_status)
  ).length;
  const returnSoon = filtered.filter((item) => matchesReturnFilter(item, "next 30 days")).length;
  const noReturnDate = filtered.filter((item) => matchesReturnFilter(item, "no date")).length;

  container.innerHTML = `
    <div class="section-heading tight-heading">
      <div>
        <p class="eyebrow">Owner/Admin Snapshot</p>
        <h2>Advanced Health Check</h2>
      </div>
      <p class="muted">${isAdminMode() ? "Based on all synced records visible to admins." : "Based on records this signed-in account can access."}</p>
    </div>
    <div class="stats-grid compact-stats">
      ${[
        ["Users", userCount],
        ["Records", filtered.length],
        ["Photos", photoCount],
        ["Failed syncs", failedSyncs],
        ["Pending syncs", pendingSyncs],
        ["Return next 30", returnSoon],
        ["No return date", noReturnDate]
      ]
        .map(
          ([label, value]) => `
            <article class="stat-card">
              <strong>${value}</strong>
              <span>${label}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRecords(filtered) {
  const dashboardRecords = getDashboardRecords();
  const visibleRecords = filtered.slice(0, visibleRecordLimit);
  document.querySelector("#record-count").textContent = `Showing ${visibleRecords.length} of ${filtered.length} matching synced records`;

  const records = document.querySelector("#records");
  if (filtered.length === 0) {
    records.innerHTML = `<article class="panel"><p class="muted">No records match the current filters.</p></article>`;
    return;
  }

  records.innerHTML = `
    ${visibleRecords.map(renderRecordCard).join("")}
    ${
      visibleRecords.length < filtered.length
        ? `
          <article class="panel compact-panel load-more-panel">
            <p class="muted">${filtered.length - visibleRecords.length} more matching record(s) are held back until you ask for them.</p>
            <button id="load-more-records" type="button">Load More Records</button>
          </article>
        `
        : ""
    }
  `;
  const loadMoreButton = document.querySelector("#load-more-records");
  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () => {
      visibleRecordLimit += DASHBOARD_CARD_PAGE_SIZE;
      redrawDashboardData();
    });
  }
  document.querySelectorAll("[data-detail-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRecordId = button.getAttribute("data-detail-id");
      renderDetailModal();
    });
  });
  document.querySelectorAll("[data-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      sharePlantCard(button.getAttribute("data-card-id"));
    });
  });
  document.querySelectorAll("[data-open-photo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openPhoto(button.getAttribute("data-open-photo-id"));
    });
  });
  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteCloudObservation(button.getAttribute("data-delete-id"));
    });
  });
}

function renderRecordCard(record) {
  const photos = photosByObservation.get(record.id) ?? [];
  const primaryPhoto = photos.find((photo) => photo.photo_role === "primary") ?? photos[0];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${record.latitude},${record.longitude}`)}`;
  const canDelete = canManageRecord(record);

  return `
    <article class="plant-card">
      ${primaryPhoto ? renderPhotoShell(primaryPhoto, record.common_name, "thumb") : `<div class="photo-placeholder">No photo</div>`}
      <div class="plant-card-body">
        <div class="plant-title-row">
          <div>
            <h3>${escapeHtml(record.common_name)}</h3>
            ${record.scientific_name ? `<p class="scientific">${escapeHtml(record.scientific_name)}</p>` : ""}
          </div>
          ${record.confidence_score ? `<span class="score">${Number(record.confidence_score).toFixed(1)}%</span>` : ""}
        </div>
        ${record.other_names?.length ? `<p class="muted">Also called: ${escapeHtml(record.other_names.join(", "))}</p>` : ""}
        <div class="meta-grid">
          ${renderMeta("Date", formatDate(record.observed_at))}
          ${renderMeta("Status", record.collection_status ?? "unknown")}
          ${renderMeta("Interest", (record.collection_interests ?? []).join(", ") || "none")}
          ${renderMeta("Return Date", record.return_date || "not set")}
          ${
            activeFilters.advanced
              ? `
                ${isAdmin ? renderMeta("Member", formatMemberLabel(getRecordUserId(record))) : ""}
                ${renderMeta("Privacy", record.privacy_level ?? "private")}
                ${renderMeta("Accuracy", record.accuracy_meters ? `${Number(record.accuracy_meters).toFixed(1)} m` : "n/a")}
                ${renderMeta("Sync", record.sync_status ?? "unknown")}
              `
              : ""
          }
        </div>
        ${record.notes ? `<p>${escapeHtml(record.notes)}</p>` : ""}
        ${record.gather_notes ? `<p class="muted"><strong>Gather notes:</strong> ${escapeHtml(record.gather_notes)}</p>` : ""}
        <div class="actions">
          <button class="link-button" type="button" data-detail-id="${escapeHtml(record.id)}">View Details</button>
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open Map</a>
          ${primaryPhoto ? `<button class="link-button" type="button" data-open-photo-id="${escapeHtml(primaryPhoto.id)}">Open Photo</button>` : ""}
          <button class="link-button" type="button" data-card-id="${escapeHtml(record.id)}">Share Plant Card</button>
          ${canDelete ? `<button class="link-button danger-link" type="button" data-delete-id="${escapeHtml(record.id)}">Delete</button>` : ""}
          ${isAdmin && !canDelete ? `<span class="read-only-note">Read-only member record</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderReturnSoon(filtered) {
  const returnSoon = filtered
    .map((record) => ({ record, status: getReturnStatus(record.return_date) }))
    .filter(({ record, status }) =>
      record.collection_status === "ready now" ||
      status.bucket === "overdue" ||
      status.bucket === "soon"
    )
    .sort((a, b) => a.status.sortValue - b.status.sortValue)
    .slice(0, 6);

  const container = document.querySelector("#return-soon");
  if (returnSoon.length === 0) {
    container.innerHTML = `
      <article class="panel compact-panel">
        <p class="muted">No return dates due soon. Field notebook is quiet for the moment.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = returnSoon
    .map(({ record, status }) => {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${record.latitude},${record.longitude}`)}`;
      return `
        <article class="return-card">
          <div>
            <p class="eyebrow">${escapeHtml(status.label)}</p>
            <h3>${escapeHtml(record.common_name)}</h3>
            <p class="muted">${escapeHtml(record.collection_status ?? "unknown")} | ${escapeHtml((record.collection_interests ?? []).join(", ") || "no interest set")}</p>
          </div>
          <div class="actions">
            <button class="link-button" type="button" data-detail-id="${escapeHtml(record.id)}">Details</button>
            <a href="${mapsUrl}" target="_blank" rel="noreferrer">Map</a>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-detail-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRecordId = button.getAttribute("data-detail-id");
      renderDetailModal();
    });
  });
}

function matchesReturnFilter(record, filter) {
  if (filter === "all") return true;
  if (filter === "ready now") return record.collection_status === "ready now";

  const status = getReturnStatus(record.return_date);
  if (filter === "overdue") return status.bucket === "overdue";
  if (filter === "no date") return status.bucket === "none" || status.bucket === "text";
  if (filter === "next 7 days") {
    return status.bucket === "soon" && status.sortValue >= 0 && status.sortValue <= 7;
  }
  if (filter === "next 30 days") {
    return (
      record.collection_status === "ready now" ||
      status.bucket === "overdue" ||
      (Number.isFinite(status.sortValue) && status.sortValue >= 0 && status.sortValue <= 30)
    );
  }

  return true;
}

function renderDetailModal() {
  const modal = document.querySelector("#detail-modal");
  if (!modal) return;

  const record = selectedRecordId
    ? observations.find((item) => item.id === selectedRecordId)
    : undefined;

  if (!record) {
    modal.innerHTML = "";
    return;
  }

  const photos = photosByObservation.get(record.id) ?? [];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${record.latitude},${record.longitude}`)}`;
  const canDelete = canManageRecord(record);
  const photoTiles = photos
    .map((photo) => {
      return renderPhotoShell(photo, photo.file_name ?? record.common_name, "detail", {
        link: true
      });
    })
    .join("");

  modal.innerHTML = `
    <div class="modal-backdrop" role="presentation">
      <article class="detail-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(record.common_name)} details">
        <button class="modal-close" type="button" id="close-detail">Close</button>
        <p class="eyebrow">Plant Record</p>
        <h2>${escapeHtml(record.common_name)}</h2>
        ${record.scientific_name ? `<p class="scientific">${escapeHtml(record.scientific_name)}</p>` : ""}
        ${record.other_names?.length ? `<p class="muted">Also called: ${escapeHtml(record.other_names.join(", "))}</p>` : ""}
        <div class="meta-grid">
          ${renderMeta("Observed", formatDate(record.observed_at))}
          ${renderMeta("Status", record.collection_status ?? "unknown")}
          ${renderMeta("Interest", (record.collection_interests ?? []).join(", ") || "none")}
          ${renderMeta("Return Date", record.return_date || "not set")}
          ${isAdmin ? renderMeta("Member", formatMemberLabel(getRecordUserId(record))) : ""}
          ${renderMeta("Accuracy", record.accuracy_meters ? `${Number(record.accuracy_meters).toFixed(1)} m` : "n/a")}
          ${renderMeta("Privacy", record.privacy_level ?? "private")}
        </div>
        ${record.notes ? `<p><strong>Notes:</strong> ${escapeHtml(record.notes)}</p>` : ""}
        ${record.gather_notes ? `<p><strong>Gather notes:</strong> ${escapeHtml(record.gather_notes)}</p>` : ""}
        <div class="photo-strip">${photoTiles || `<div class="photo-placeholder">No synced photos</div>`}</div>
        <div class="actions">
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open in Google Maps</a>
          <button class="link-button" type="button" id="share-detail-card">Share Plant Card</button>
          ${canDelete ? `<button class="link-button danger-link" type="button" id="delete-detail">Delete Plant</button>` : ""}
          ${isAdmin && !canDelete ? `<span class="read-only-note">Read-only member record</span>` : ""}
        </div>
      </article>
    </div>
  `;

  document.querySelector("#close-detail").addEventListener("click", () => {
    selectedRecordId = null;
    renderDetailModal();
  });
  document.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) {
      selectedRecordId = null;
      renderDetailModal();
    }
  });
  const deleteButton = document.querySelector("#delete-detail");
  if (deleteButton) {
    deleteButton.addEventListener("click", () => {
      deleteCloudObservation(record.id);
    });
  }
  document.querySelector("#share-detail-card").addEventListener("click", () => {
    sharePlantCard(record.id);
  });
  hydratePhotoPlaceholders(modal);
}

async function sharePlantCard(recordId) {
  const record = observations.find((item) => item.id === recordId);
  if (!record) return;

  try {
    const blob = await createPlantCardBlob(record);
    const fileName = `${safeFileName(record.common_name)}-plant-card.png`;

    if (
      navigator.canShare &&
      typeof File !== "undefined" &&
      navigator.share
    ) {
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${record.common_name} plant card`,
          text: `BCN Plant Scout record for ${record.common_name}`
        });
        return;
      }
    }

    downloadBlob(blob, fileName);
  } catch (error) {
    window.alert(`Plant card export failed: ${getErrorMessage(error)}`);
  }
}

async function createPlantCardBlob(record) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable.");
  }

  ctx.fillStyle = "#f5f8ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  roundRect(ctx, 32, 32, 1016, 1286, 48, "#fbfdf8", "#d8e3cf");

  const photos = photosByObservation.get(record.id) ?? [];
  const primaryPhoto = photos.find((photo) => photo.photo_role === "primary") ?? photos[0];
  const photoUrl = primaryPhoto ? await ensureSignedPhotoUrl(primaryPhoto, "card") : null;

  if (photoUrl) {
    try {
      const image = await loadImage(photoUrl);
      drawCoverImage(ctx, image, 64, 64, 952, 520, 28);
    } catch {
      drawPhotoPlaceholder(ctx);
    }
  } else {
    drawPhotoPlaceholder(ctx);
  }

  drawText(ctx, "BASE CAMP NORTH", 72, 660, {
    size: 30,
    weight: "800",
    color: "#6a765f"
  });
  drawText(ctx, record.common_name || "Plant observation", 72, 736, {
    size: 76,
    weight: "900",
    color: "#113d22",
    maxWidth: 920
  });
  if (record.scientific_name) {
    drawText(ctx, record.scientific_name, 72, 798, {
      size: 42,
      style: "italic",
      color: "#4b5d42",
      maxWidth: 920
    });
  }

  drawCanvasChip(ctx, 72, 858, "Date", formatDate(record.observed_at));
  drawCanvasChip(ctx, 346, 858, "Status", record.collection_status ?? "field record");
  drawCanvasChip(ctx, 620, 858, "Interest", (record.collection_interests ?? []).join(", ") || "observation");
  drawCanvasChip(ctx, 72, 1010, "Return Date", record.return_date || "not set");

  const notes = record.notes || record.gather_notes || "";
  if (notes) {
    drawText(ctx, "FIELD NOTE", 72, 1188, {
      size: 28,
      weight: "800",
      color: "#6a765f"
    });
    drawWrappedCanvasText(ctx, notes, 72, 1230, 560, 36, 3);
  }

  roundRect(ctx, 680, 1168, 320, 86, 24, "#113d22");
  drawText(ctx, "BCN Plant Scout", 840, 1208, {
    size: 24,
    weight: "900",
    color: "#f5f8ef",
    align: "center"
  });
  drawText(ctx, "basecampnorthpa.com", 840, 1240, {
    size: 20,
    weight: "700",
    color: "#d2be97",
    align: "center"
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create plant card image."));
      }
    }, "image/png");
  });
}

function drawPhotoPlaceholder(ctx) {
  roundRect(ctx, 64, 64, 952, 520, 28, "#e7ecde");
  drawText(ctx, "Plant photo saved", 540, 330, {
    size: 42,
    weight: "800",
    color: "#4b5d42",
    align: "center"
  });
}

function drawCoverImage(ctx, image, x, y, width, height, radius) {
  ctx.save();
  roundedPath(ctx, x, y, width, height, radius);
  ctx.clip();

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

function drawCanvasChip(ctx, x, y, label, value) {
  roundRect(ctx, x, y, 240, 112, 18, "#eef5e9", "#d8e3cf");
  drawText(ctx, String(label).toUpperCase(), x + 24, y + 42, {
    size: 24,
    weight: "900",
    color: "#6a765f",
    maxWidth: 192
  });
  drawText(ctx, truncateText(value || "not set", 18), x + 24, y + 82, {
    size: 28,
    weight: "900",
    color: "#113d22",
    maxWidth: 192
  });
}

function drawWrappedCanvasText(ctx, value, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (words.join(" ").length > lines.join(" ").length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\.*$/, "")}...`;
  }

  lines.forEach((line, index) => {
    drawText(ctx, line, x, y + index * lineHeight, {
      size: 30,
      color: "#324832",
      maxWidth
    });
  });
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 28,
    weight = "400",
    style = "normal",
    color = "#113d22",
    align = "left",
    maxWidth
  } = options;
  ctx.fillStyle = color;
  ctx.font = `${style} ${weight} ${size}px Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(text ?? ""), x, y, maxWidth);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.save();
  roundedPath(ctx, x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
}

function roundedPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return String(value || "plant")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "plant";
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

async function deleteCloudObservation(recordId) {
  if (!recordId) return;

  const record = observations.find((item) => item.id === recordId);
  if (!record) return;
  if (!canManageRecord(record)) {
    window.alert("Admin view is read-only for other members' records. This plant was not deleted.");
    return;
  }

  const confirmed = window.confirm(
    `Delete ${record.common_name} from the cloud dashboard? This hides it from synced records and removes it from phones the next time they download cloud records.`
  );
  if (!confirmed) return;

  const photos = photosByObservation.get(recordId) ?? [];

  try {
    const deletedAt = new Date().toISOString();
    const { error: observationError } = await supabase
      .from("observations")
      .update({
        deleted_at: deletedAt,
        sync_status: "synced",
        sync_error: null,
        updated_at: deletedAt
      })
      .eq("id", recordId);
    if (observationError) throw observationError;

    selectedRecordId = null;
    observations = observations.filter((item) => item.id !== recordId);
    photosByObservation.delete(recordId);
    photos.forEach(clearSignedPhotoUrlCache);
    redrawDashboardData();
  } catch (error) {
    window.alert(`Delete failed: ${getErrorMessage(error)}`);
  }
}

function renderMap(filtered) {
  const mapElement = document.querySelector("#map");
  if (!mapElement) {
    return;
  }

  if (!map) {
    map = L.map(mapElement, { scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  map.invalidateSize();
  markerLayer.clearLayers();
  const points = filtered
    .filter(hasCoordinates)
    .map((record) => [Number(record.latitude), Number(record.longitude), record]);

  points.forEach(([lat, lon, record]) => {
    const color = statusColor(record.collection_status);
    const marker = L.circleMarker([lat, lon], {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95
    }).addTo(markerLayer);
    marker.bindPopup(`
      <strong>${escapeHtml(record.common_name)}</strong><br />
      ${record.scientific_name ? `<em>${escapeHtml(record.scientific_name)}</em><br />` : ""}
      ${escapeHtml(record.collection_status ?? "unknown")}<br />
      <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noreferrer">Navigate</a>
    `);
  });

  if (points.length > 0) {
    const bounds = L.latLngBounds(points.map(([lat, lon]) => [lat, lon]));
    map.fitBounds(bounds.pad(0.2), { maxZoom: 15 });
  } else {
    map.setView([40.254, -74.038], 11);
  }

  window.setTimeout(() => map?.invalidateSize(), 150);
}

function resetMap() {
  if (map) {
    map.remove();
  }
  map = null;
  markerLayer = null;
}

function renderUserOptions() {
  const userIds = uniqueValues(observations.map(getRecordUserId));
  return [
    `<option value="all" ${activeFilters.user === "all" ? "selected" : ""}>all members</option>`,
    ...userIds.map(
      (userId) =>
        `<option value="${escapeHtml(userId)}" ${userId === activeFilters.user ? "selected" : ""}>${escapeHtml(formatMemberLabel(userId))}</option>`
    )
  ].join("");
}

function renderAdminList(items, emptyText, renderItem) {
  if (items.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  return `<ul class="admin-list">${items.map(renderItem).join("")}</ul>`;
}

function getMemberSummaries(records) {
  const summaries = new Map();

  records.forEach((record) => {
    const userId = getRecordUserId(record);
    const current = summaries.get(userId) ?? {
      userId,
      count: 0,
      photos: 0,
      readyNow: 0,
      failedSyncs: 0,
      latestAt: 0
    };

    current.count += 1;
    current.photos += photosByObservation.get(record.id)?.length ?? 0;
    current.readyNow += record.collection_status === "ready now" ? 1 : 0;
    current.failedSyncs += record.sync_status === "sync failed" ? 1 : 0;
    current.latestAt = Math.max(current.latestAt, getRecordTime(record));
    summaries.set(userId, current);
  });

  return [...summaries.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.latestAt - a.latestAt;
  });
}

function getTopCounts(values, limit) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => {
    const label = String(value).trim() || "Unknown plant";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

function countPhotosForRecords(records) {
  return records.reduce((sum, record) => sum + (photosByObservation.get(record.id)?.length ?? 0), 0);
}

function isAdminMode() {
  return Boolean(isAdmin && dashboardMode === "admin");
}

function getDashboardRecords() {
  if (isAdminMode()) {
    return observations;
  }

  return observations.filter((record) => canManageRecord(record));
}

function getRecordUserId(record) {
  return record.user_id ?? record.owner_id ?? "unknown";
}

function formatMemberLabel(userId) {
  if (!userId || userId === "unknown") return "unknown member";
  const text = String(userId);
  return text.length > 12 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
}

function canManageRecord(record) {
  return Boolean(session?.user?.id && getRecordUserId(record) === session.user.id);
}

function hasCoordinates(record) {
  return Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude));
}

function getRecordTime(record, preferredField) {
  const fields = preferredField
    ? [preferredField, "observed_at", "created_at", "updated_at"]
    : ["observed_at", "created_at", "updated_at"];

  for (const field of fields) {
    const value = record[field];
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

function formatDateFromTime(timestamp) {
  if (!timestamp) return "n/a";
  return formatDate(new Date(timestamp).toISOString());
}

function renderMeta(label, value) {
  return `
    <div class="meta">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderOptions(options, selected) {
  return options
    .filter(Boolean)
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`
    )
    .join("");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function groupBy(rows, key) {
  return rows.reduce((map, row) => {
    const groupKey = row[key];
    map.set(groupKey, [...(map.get(groupKey) ?? []), row]);
    return map;
  }, new Map());
}

function statusColor(status) {
  if (status === "ready now") return "#1f8f48";
  if (status === "return later") return "#c87d19";
  if (status === "collected") return "#5c725e";
  if (status === "do not collect") return "#a23b2a";
  if (status === "not ready") return "#8a8f83";
  return "#2f7b44";
}

function formatDate(value) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function getReturnStatus(returnDate) {
  if (!returnDate) {
    return { bucket: "none", label: "No date", sortValue: Number.POSITIVE_INFINITY };
  }

  const parsedDate = parseReturnDate(returnDate);
  if (!parsedDate) {
    return { bucket: "text", label: returnDate, sortValue: Number.POSITIVE_INFINITY - 1 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsedDate.setHours(0, 0, 0, 0);
  const daysAway = Math.round((parsedDate.getTime() - today.getTime()) / 86400000);

  if (daysAway < 0) {
    return { bucket: "overdue", label: `${Math.abs(daysAway)} days overdue`, sortValue: daysAway };
  }
  if (daysAway === 0) {
    return { bucket: "soon", label: "Due today", sortValue: 0 };
  }
  if (daysAway <= 14) {
    return { bucket: "soon", label: `Due in ${daysAway} days`, sortValue: daysAway };
  }

  return { bucket: "later", label: formatDate(parsedDate.toISOString()), sortValue: daysAway };
}

function parseReturnDate(returnDate) {
  const trimmed = String(returnDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setMessage(id, message, isError = false) {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function renderError(message) {
  document.querySelector("#records").innerHTML = `
    <article class="panel error-panel">
      <h2>Dashboard load failed</h2>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return String(error ?? "Something went wrong.");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
