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
const ETSY_SHOP_URL = "https://basecampnorthpa.etsy.com";
const APP_STORE_URL = "#";
const BCN_FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61581856435743";
const IOS_TEST_DM_TEXT =
  "Hi Base Camp North, I would like to join the BCN Plant Scout iOS closed test through TestFlight. My Apple ID email is:";
const GOOGLE_GROUP_URL = "https://groups.google.com/g/bcn-plant-scout";
const PLAY_TESTING_URL =
  "https://play.google.com/apps/testing/com.basecampnorth.bcnplantscout";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.basecampnorth.bcnplantscout";

let supabase = null;
let session = null;
let isAdmin = false;
let dashboardMode = getInitialDashboardMode();
let observations = [];
let photosByObservation = new Map();
let signedPhotoUrls = new Map();
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
    <main class="marketing-page">
      <section class="hero">
        <div class="hero-copy">
          <img class="brand-mark" src="/images/bcn-logo-with-text.png" alt="Base Camp North" />
          <p class="eyebrow">Base Camp North</p>
          <h1>BCN Plant Scout</h1>
          <p class="hero-lede">A rugged field notebook for tree nursery work: capture plant photos, GPS points, return notes, seed sources, and synced records you can review from the computer.</p>
          <div class="hero-actions">
            <a class="store-button" href="${APP_STORE_URL}" aria-disabled="true">App Store Coming Soon</a>
            <a class="store-button secondary-store" href="${PLAY_TESTING_URL}" target="_blank" rel="noreferrer">Join Android Test</a>
            <a class="store-button secondary-store" href="${BCN_FACEBOOK_URL}" target="_blank" rel="noreferrer">BCN on Facebook</a>
          </div>
          <p class="muted small-note">Already using the app? Sign in below to continue your field work.</p>
        </div>
        <div class="hero-card" aria-label="BCN Plant Scout feature preview">
          <p class="eyebrow">Field Kit</p>
          <img class="hero-kit-image" src="/images/scout-field-kit.webp" alt="Field notebook kit with scouting tools" />
          <div class="notebook-lines">
            <span>Photo records with GPS</span>
            <span>Return and harvest notes</span>
            <span>Desktop map and record review</span>
          </div>
          <div class="hero-stat-row">
            <strong>Plants</strong>
            <strong>Dirt</strong>
            <strong>Trees</strong>
          </div>
        </div>
      </section>

      <section class="dashboard-link-panel panel">
        <div class="dashboard-link-copy">
          <p class="eyebrow">Web dashboard link</p>
          <h2>Send this page to yourself before you head outside.</h2>
          <p>BCN Plant Scout is two pieces: the phone app for field records, and this private web dashboard for reviewing synced photos, map points, return dates, and collection notes on a bigger screen. Send the link to your email, messages, Facebook, or wherever you keep links you need later.</p>
          <p class="dashboard-link-url">${escapeHtml(DASHBOARD_URL)}</p>
        </div>
        <div class="dashboard-link-actions">
          <button id="share-dashboard-link" class="share-action primary-share" type="button">Share Link</button>
          <button id="email-dashboard-link" class="share-action" type="button">Email Link</button>
          <button id="copy-dashboard-link" class="share-action secondary-share" type="button">Copy Link</button>
          <p id="share-link-message" class="message share-link-message"></p>
        </div>
      </section>

      <section class="public-info-panel panel">
        <div>
          <p class="eyebrow">Support and account</p>
          <h2>Need help with BCN Plant Scout?</h2>
          <p>Use these links for app support, privacy details, account deletion help, and the Base Camp North Etsy shop.</p>
        </div>
        <div class="public-link-actions">
          <a class="store-button" href="${SUPPORT_URL}">Support</a>
          <a class="store-button secondary-store" href="${DELETE_ACCOUNT_URL}">Delete Account</a>
          <a class="store-button secondary-store" href="${PRIVACY_POLICY_URL}">Privacy Policy</a>
          <a class="store-button secondary-store" href="${ETSY_SHOP_URL}" target="_blank" rel="noreferrer">BCN Etsy</a>
        </div>
      </section>

      <section class="tester-section">
        <div class="tester-grid">
          <div class="panel tester-panel">
            <p class="eyebrow">Help test BCN Plant Scout</p>
            <h2>Android closed testing</h2>
            <p>Testing is open to invited Google accounts. Join the tester group first, enroll in the closed test, then install the app from Google Play.</p>
            <div class="tester-steps">
              <a href="${GOOGLE_GROUP_URL}" target="_blank" rel="noreferrer">
                <strong>1</strong>
                <span>Join Google Group</span>
              </a>
              <a href="${PLAY_TESTING_URL}" target="_blank" rel="noreferrer">
                <strong>2</strong>
                <span>Enroll in Testing</span>
              </a>
              <a href="${PLAY_STORE_URL}" target="_blank" rel="noreferrer">
                <strong>3</strong>
                <span>Open App Listing</span>
              </a>
            </div>
            <p class="muted small-note">If Google says the app is not available, make sure you joined the tester group with the same Google account used on your phone.</p>
          </div>
          <div class="panel tester-panel">
            <p class="eyebrow">Apple TestFlight</p>
            <h2>iPhone closed testing</h2>
            <p>Want to test on iPhone? Message the Base Camp North Facebook page and include the Apple ID email address you use for TestFlight.</p>
            <a class="store-button tester-mail-button" href="${BCN_FACEBOOK_URL}" target="_blank" rel="noreferrer">Message BCN on Facebook</a>
            <div class="message-template">
              <p class="eyebrow">Copy this message</p>
              <p>${escapeHtml(IOS_TEST_DM_TEXT)}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="about-grid">
        <article class="panel about-panel">
          <img class="about-image" src="/images/scout-seedling-tray.webp" alt="Seedling tray for nursery work" />
          <p class="eyebrow">About the app</p>
          <h2>Built for finding the plant again.</h2>
          <p>BCN Plant Scout turns a field photo into a useful nursery record: what it is, where it is, why it matters, when to come back, and whether it is ready for seeds, cuttings, fruit, nuts, or scion wood.</p>
        </article>
        <article class="panel about-panel">
          <img class="about-image" src="/images/scout-cuttings-bundle.webp" alt="Bundle of plant cuttings with field tag" />
          <p class="eyebrow">Field workflow</p>
          <h2>Take the photo. Keep the trail.</h2>
          <p>Start with the plant in front of you, then build the record around it: GPS, photos, notes, return plans, harvest status, and the details that make the spot worth finding again.</p>
        </article>
        <article class="panel about-panel">
          <img class="about-image" src="/images/scout-field-map.webp" alt="Field map with location pin" />
          <p class="eyebrow">Desktop companion</p>
          <h2>Scout in the field. Review at the desk.</h2>
          <p>Use the mobile app outside, then open the web dashboard later to review photos, map points, return dates, and collection notes on a bigger screen.</p>
        </article>
        <article class="panel about-panel">
          <img class="about-image" src="/images/scout-greenhouse-tools.webp" alt="Greenhouse and nursery tools" />
          <p class="eyebrow">Base Camp North</p>
          <h2>Nursery work, not just plant ID.</h2>
          <p>This is for real scouting: native trees, seed collecting, berry checks, return trips, and building a better memory of the land one observation at a time.</p>
        </article>
      </section>

      <section class="species-section panel">
        <div class="section-heading marketing-heading">
          <div>
            <p class="eyebrow">Scout-worthy finds</p>
            <h2>Track seed, cutting, fruit, and nut sources.</h2>
          </div>
        </div>
        <div class="species-grid">
          ${renderSpeciesTile("/images/scout-elderberry.webp", "Elderberry", "berries and cuttings")}
          ${renderSpeciesTile("/images/scout-chestnut.webp", "Chestnut", "nuts and parent trees")}
          ${renderSpeciesTile("/images/scout-crabapple.webp", "Crabapple", "fruit and scion wood")}
          ${renderSpeciesTile("/images/scout-evergreen-cones.webp", "Evergreen", "cones and seed sources")}
        </div>
      </section>

      <section class="reviews-section">
        <div class="section-heading marketing-heading">
          <div>
            <p class="eyebrow">Field notes from very real imaginary reviewers</p>
            <h2>Early praise</h2>
          </div>
        </div>
        <div class="reviews-grid">
          ${renderReview("Five stars for saving me from saying 'that tree by the rock' for the 400th time.", "Return Trip Professional")}
          ${renderReview("Finally, a plant app that understands I came back for acorns and forgot where I parked.", "Slightly Lost Seed Collector")}
          ${renderReview("My notes, photos, and map points are all in one place. My clipboard is jealous.", "Nursery Notebook Enthusiast")}
        </div>
      </section>

      <section class="login-shell">
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
    </main>
  `;

  document.querySelector("#email-form").addEventListener("submit", signInWithEmail);
  document.querySelector("#google-sign-in").addEventListener("click", signInWithGoogle);
  document.querySelector("#share-dashboard-link").addEventListener("click", shareDashboardLink);
  document.querySelector("#email-dashboard-link").addEventListener("click", emailDashboardLink);
  document.querySelector("#copy-dashboard-link").addEventListener("click", copyDashboardLink);
}

function renderReview(text, author) {
  return `
    <article class="review-card">
      <p class="stars">★★★★★</p>
      <p>"${escapeHtml(text)}"</p>
      <strong>${escapeHtml(author)}</strong>
    </article>
  `;
}

function renderSpeciesTile(src, name, detail) {
  return `
    <article class="species-tile">
      <img src="${src}" alt="${escapeHtml(name)} field scouting illustration" />
      <div>
        <h3>${escapeHtml(name)}</h3>
        <p>${escapeHtml(detail)}</p>
      </div>
    </article>
  `;
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
  document.querySelector("#refresh").addEventListener("click", loadDashboard);
  document.querySelector("#search").addEventListener("input", (event) => {
    activeFilters.search = event.target.value;
    redrawDashboardData();
  });
  document.querySelector("#status-filter").addEventListener("change", (event) => {
    activeFilters.status = event.target.value;
    redrawDashboardData();
  });
  document.querySelector("#interest-filter").addEventListener("change", (event) => {
    activeFilters.interest = event.target.value;
    redrawDashboardData();
  });
  document.querySelector("#privacy-filter").addEventListener("change", (event) => {
    activeFilters.privacy = event.target.value;
    redrawDashboardData();
  });
  document.querySelector("#return-filter").addEventListener("change", (event) => {
    activeFilters.returnWindow = event.target.value;
    redrawDashboardData();
  });
  const userFilter = document.querySelector("#user-filter");
  if (userFilter) {
    userFilter.addEventListener("change", (event) => {
      activeFilters.user = event.target.value;
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
  renderDashboard();
  hydrateDashboard();
  redrawDashboardData();
}

async function loadDashboard() {
  setRecordsLoading();
  await loadAdminStatus();
  if (!isAdmin) {
    dashboardMode = "member";
  }

  const { data: observationRows, error: observationError } = await supabase
    .from("observations")
    .select("*")
    .is("deleted_at", null)
    .order("observed_at", { ascending: false });

  if (observationError) {
    renderError(observationError.message);
    return;
  }

  const { data: photoRows, error: photoError } = await supabase
    .from("observation_photos")
    .select("*")
    .order("added_at", { ascending: true });

  if (photoError) {
    renderError(photoError.message);
    return;
  }

  observations = observationRows ?? [];
  const adminMode = isAdminMode();
  const dashboardRecords = getDashboardRecords();
  if (!adminMode || !dashboardRecords.some((record) => getRecordUserId(record) === activeFilters.user)) {
    activeFilters.user = "all";
  }
  const visibleObservationIds = new Set(observations.map((record) => record.id));
  const visiblePhotoRows = (photoRows ?? []).filter((photo) =>
    visibleObservationIds.has(photo.observation_id)
  );
  photosByObservation = groupBy(visiblePhotoRows, "observation_id");
  signedPhotoUrls = await createSignedPhotoUrlMap(visiblePhotoRows);
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

async function createSignedPhotoUrlMap(photoRows) {
  const entries = await Promise.all(
    photoRows
      .filter((photo) => photo.storage_path)
      .map(async (photo) => {
        const { data, error } = await supabase.storage
          .from(PLANT_PHOTOS_BUCKET)
          .createSignedUrl(photo.storage_path, 60 * 60);

        if (error || !data?.signedUrl) {
          return [photo.id, null];
        }
        return [photo.id, data.signedUrl];
      })
  );

  return new Map(entries);
}

function redrawDashboardData() {
  const filtered = getFilteredObservations();
  renderStats(filtered);
  renderAdminConsole(filtered);
  renderReturnSoon(filtered);
  renderRecords(filtered);
  renderMap(filtered);
  renderDetailModal();
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
  document.querySelector("#record-count").textContent = `${filtered.length} of ${dashboardRecords.length} synced records`;

  const records = document.querySelector("#records");
  if (filtered.length === 0) {
    records.innerHTML = `<article class="panel"><p class="muted">No records match the current filters.</p></article>`;
    return;
  }

  records.innerHTML = filtered.map(renderRecordCard).join("");
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
  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteCloudObservation(button.getAttribute("data-delete-id"));
    });
  });
}

function renderRecordCard(record) {
  const photos = photosByObservation.get(record.id) ?? [];
  const primaryPhoto = photos.find((photo) => photo.photo_role === "primary") ?? photos[0];
  const photoUrl = primaryPhoto ? signedPhotoUrls.get(primaryPhoto.id) : null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${record.latitude},${record.longitude}`)}`;
  const canDelete = canManageRecord(record);

  return `
    <article class="plant-card">
      ${photoUrl ? `<img src="${photoUrl}" alt="${escapeHtml(record.common_name)}" />` : `<div class="photo-placeholder">No photo</div>`}
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
          ${photoUrl ? `<a href="${photoUrl}" target="_blank" rel="noreferrer">Open Photo</a>` : ""}
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
      const photoUrl = signedPhotoUrls.get(photo.id);
      return photoUrl
        ? `<a href="${photoUrl}" target="_blank" rel="noreferrer"><img src="${photoUrl}" alt="${escapeHtml(photo.file_name ?? record.common_name)}" /></a>`
        : "";
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
  const photoUrl = primaryPhoto ? signedPhotoUrls.get(primaryPhoto.id) : null;

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
    photos.forEach((photo) => signedPhotoUrls.delete(photo.id));
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
