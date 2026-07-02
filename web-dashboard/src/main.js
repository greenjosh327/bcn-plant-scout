import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const app = document.querySelector("#app");
const PLANT_PHOTOS_BUCKET = "plant-photos";
const APP_STORE_URL = "#";
const PLAY_STORE_URL = "#";

let supabase = null;
let session = null;
let observations = [];
let photosByObservation = new Map();
let signedPhotoUrls = new Map();
let activeFilters = {
  search: "",
  status: "all",
  interest: "all",
  privacy: "all"
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
          <p class="eyebrow">Base Camp North</p>
          <h1>BCN Plant Scout</h1>
          <p class="hero-lede">A rugged field notebook for tree nursery work: capture plant photos, GPS points, return notes, seed sources, and synced records you can review from the computer.</p>
          <div class="hero-actions">
            <a class="store-button" href="${APP_STORE_URL}" aria-disabled="true">App Store Coming Soon</a>
            <a class="store-button secondary-store" href="${PLAY_STORE_URL}" aria-disabled="true">Google Play Coming Soon</a>
          </div>
          <p class="muted small-note">Already using the app? Sign in below to continue your field work.</p>
        </div>
        <div class="hero-card" aria-label="BCN Plant Scout feature preview">
          <p class="eyebrow">Field Kit</p>
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

      <section class="about-grid">
        <article class="panel about-panel">
          <p class="eyebrow">About the app</p>
          <h2>Built for finding the plant again.</h2>
          <p>BCN Plant Scout turns a field photo into a useful nursery record: what it is, where it is, why it matters, when to come back, and whether it is ready for seeds, cuttings, fruit, nuts, or scion wood.</p>
        </article>
        <article class="panel about-panel">
          <p class="eyebrow">Desktop companion</p>
          <h2>Scout in the field. Review at the desk.</h2>
          <p>Use the mobile app outside, then open the web dashboard later to review photos, map points, return dates, and collection notes on a bigger screen.</p>
        </article>
        <article class="panel about-panel">
          <p class="eyebrow">Base Camp North</p>
          <h2>Nursery work, not just plant ID.</h2>
          <p>This is for real scouting: native trees, seed collecting, berry checks, return trips, and building a better memory of the land one observation at a time.</p>
        </article>
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
      redirectTo: window.location.origin
    }
  });

  if (error) {
    setMessage("auth-message", error.message, true);
  }
}

function renderDashboard() {
  resetMap();
  app.innerHTML = `
    <main class="page">
      <header class="topbar">
        <div>
          <p class="eyebrow">Base Camp North</p>
          <h1>BCN Plant Scout Dashboard</h1>
          <p class="muted">Signed in as ${escapeHtml(session.user.email ?? "field user")}</p>
        </div>
        <button id="sign-out" class="secondary">Sign Out</button>
      </header>

      <section class="stats-grid" id="stats"></section>

      <section class="toolbar panel">
        <label>
          Search
          <input id="search" type="search" placeholder="Plant, notes, status, tags..." value="${escapeHtml(activeFilters.search)}" />
        </label>
        <label>
          Status
          <select id="status-filter">${renderOptions(["all", ...uniqueValues(observations.map((item) => item.collection_status))], activeFilters.status)}</select>
        </label>
        <label>
          Interest
          <select id="interest-filter">${renderOptions(["all", ...uniqueValues(observations.flatMap((item) => item.collection_interests ?? []))], activeFilters.interest)}</select>
        </label>
        <label>
          Privacy
          <select id="privacy-filter">${renderOptions(["all", ...uniqueValues(observations.map((item) => item.privacy_level))], activeFilters.privacy)}</select>
        </label>
        <button id="refresh">Refresh</button>
      </section>

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
}

async function loadDashboard() {
  setRecordsLoading();

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
  renderReturnSoon(filtered);
  renderRecords(filtered);
  renderMap(filtered);
  renderDetailModal();
}

function getFilteredObservations() {
  const search = activeFilters.search.trim().toLowerCase();

  return observations.filter((item) => {
    const interests = item.collection_interests ?? [];
    const haystack = [
      item.common_name,
      item.scientific_name,
      item.notes,
      item.gather_notes,
      item.collection_status,
      item.privacy_level,
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
      (activeFilters.privacy === "all" || item.privacy_level === activeFilters.privacy)
    );
  });
}

function renderStats(filtered) {
  const stats = [
    ["Records", filtered.length],
    ["Photos", filtered.reduce((sum, item) => sum + (photosByObservation.get(item.id)?.length ?? 0), 0)],
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
}

function renderRecords(filtered) {
  document.querySelector("#record-count").textContent = `${filtered.length} of ${observations.length} synced records`;

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
          ${renderMeta("Privacy", record.privacy_level ?? "private")}
          ${renderMeta("Accuracy", record.accuracy_meters ? `${Number(record.accuracy_meters).toFixed(1)} m` : "n/a")}
          ${renderMeta("Return", record.return_date || "not set")}
        </div>
        ${record.notes ? `<p>${escapeHtml(record.notes)}</p>` : ""}
        ${record.gather_notes ? `<p class="muted"><strong>Gather notes:</strong> ${escapeHtml(record.gather_notes)}</p>` : ""}
        <div class="actions">
          <button class="link-button" type="button" data-detail-id="${escapeHtml(record.id)}">View Details</button>
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open Map</a>
          ${photoUrl ? `<a href="${photoUrl}" target="_blank" rel="noreferrer">Open Photo</a>` : ""}
          <button class="link-button danger-link" type="button" data-delete-id="${escapeHtml(record.id)}">Delete</button>
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
          ${renderMeta("Return", record.return_date || "not set")}
          ${renderMeta("Accuracy", record.accuracy_meters ? `${Number(record.accuracy_meters).toFixed(1)} m` : "n/a")}
          ${renderMeta("Privacy", record.privacy_level ?? "private")}
        </div>
        ${record.notes ? `<p><strong>Notes:</strong> ${escapeHtml(record.notes)}</p>` : ""}
        ${record.gather_notes ? `<p><strong>Gather notes:</strong> ${escapeHtml(record.gather_notes)}</p>` : ""}
        <div class="photo-strip">${photoTiles || `<div class="photo-placeholder">No synced photos</div>`}</div>
        <div class="actions">
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open in Google Maps</a>
          <button class="link-button danger-link" type="button" id="delete-detail">Delete Plant</button>
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
  document.querySelector("#delete-detail").addEventListener("click", () => {
    deleteCloudObservation(record.id);
  });
}

async function deleteCloudObservation(recordId) {
  if (!recordId) return;

  const record = observations.find((item) => item.id === recordId);
  if (!record) return;

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
    .filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude))
    .map((record) => [record.latitude, record.longitude, record]);

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
