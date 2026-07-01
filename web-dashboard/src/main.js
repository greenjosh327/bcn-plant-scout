import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const app = document.querySelector("#app");
const PLANT_PHOTOS_BUCKET = "plant-photos";

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
    <main class="page narrow">
      <section class="brand-panel">
        <p class="eyebrow">Base Camp North</p>
        <h1>BCN Plant Scout</h1>
        <p>Private field dashboard for synced plant observations, photos, return notes, and map review.</p>
      </section>

      <section class="panel">
        <h2>Sign In</h2>
        <p class="muted">Use the same Supabase account as the mobile app. Records stay private under your account.</p>
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
        <button id="google-sign-in" class="secondary full">Sign In With Google</button>
        <p id="auth-message" class="message"></p>
      </section>
    </main>
  `;

  document.querySelector("#email-form").addEventListener("submit", signInWithEmail);
  document.querySelector("#google-sign-in").addEventListener("click", signInWithGoogle);
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
          <p class="eyebrow">Field Records</p>
          <h2 id="record-count">Loading records...</h2>
        </div>
      </section>
      <section class="card-grid" id="records"></section>
    </main>
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
  photosByObservation = groupBy(photoRows ?? [], "observation_id");
  signedPhotoUrls = await createSignedPhotoUrlMap(photoRows ?? []);
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
  renderRecords(filtered);
  renderMap(filtered);
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
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Open Map</a>
          ${photoUrl ? `<a href="${photoUrl}" target="_blank" rel="noreferrer">Open Photo</a>` : ""}
        </div>
      </div>
    </article>
  `;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
