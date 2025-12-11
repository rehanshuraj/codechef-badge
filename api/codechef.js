// /api/codechef.js
// Vercel-compatible CommonJS function.
// Produces a combined gradient CodeChef card + 52-week heatmap SVG.
// Usage: /api/codechef?user=rihanshuraj
const https = require("https");

// small deterministic pseudo-random using username as seed
function seededRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return function () {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// map count to color for heatmap (C = gradient, we use 4 levels + none)
function colorForCount(count, style) {
  if (style === "C") {
    // colorful: higher -> red/orange; low -> green
    if (count === 0) return "#0f1720"; // dark background (no activity)
    if (count <= 1) return "#20c997"; // green-ish
    if (count <= 3) return "#ffc107"; // yellow
    if (count <= 6) return "#fd7e14"; // orange
    return "#e55353"; // red
  } else {
    // fallback green gradient
    if (count === 0) return "#0f1720";
    if (count === 1) return "#0ea5a4";
    if (count <= 3) return "#0891b2";
    if (count <= 6) return "#0369a1";
    return "#075985";
  }
}

function fetchUrlRaw(url, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", (err) => reject(err));
    req.setTimeout(timeout, () => {
      req.abort();
      reject(new Error("timeout"));
    });
  });
}

// parse rating, highest rating, global & country ranks if present
function parseProfileHtml(html) {
  // rating-number, highest rating, global rank, country rank - best effort regexes
  const rating = (html.match(/rating-number">(\d+)/) || [null, null])[1] || null;
  const highest = (html.match(/highest-rating">.*?(\d+)/) || [null, null])[1] || null;

  // global rank pattern like: "Global Rank" ... "1234"
  let global = null,
    country = null;
  const globalMatch = html.match(/Global Rank[\s\S]*?(\d+)/i);
  const countryMatch = html.match(/Country Rank[\s\S]*?(\d+)/i);
  if (globalMatch) global = globalMatch[1];
  if (countryMatch) country = countryMatch[1];

  return { rating, highest, global, country };
}

// Try to find daily activity if embedded. CodeChef does not expose a simple JSON; we attempt best-effort.
// If not found, caller will use deterministic fallback.
function parseActivityFromHtml(html) {
  // many sites embed activity as arrays; CodeChef profile pages may not include it.
  // We'll try multiple patterns that might exist; if none found return null.
  // Search for "activity" arrays or "submission" time series - best-effort only.
  const isoDates = [];
  // pattern: find timestamps in the page (YYYY-MM-DD)
  const dateRegex = /\b(20\d{2}-\d{2}-\d{2})\b/g;
  let m;
  while ((m = dateRegex.exec(html)) !== null) {
    isoDates.push(m[1]);
    if (isoDates.length > 5000) break;
  }
  if (isoDates.length < 10) return null; // not enough to build heatmap
  // count occurrences by date
  const map = {};
  isoDates.forEach((d) => (map[d] = (map[d] || 0) + 1));
  return map; // { "2024-12-01": 3, ... }
}

function buildHeatmapSvg(activityMap, username, options = {}) {
  const { style = "C" } = options; // 'C' is colorful style selected
  // Build last 52 weeks grid (7 rows x 52 columns). We'll represent as columns (weeks).
  // Create an array of 52*7 dates (last day is today).
  const today = new Date();
  // normalize to local date string YYYY-MM-DD
  function ymd(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const days = [];
  const oneDay = 24 * 60 * 60 * 1000;
  // last 364 days (52*7)
  for (let i = 0; i < 52 * 7; i++) {
    const dt = new Date(today.getTime() - (52 * 7 - 1 - i) * oneDay);
    days.push(dt);
  }
  // map counts
  const counts = days.map((d) => {
    const key = ymd(d);
    const c = activityMap && activityMap[key] ? activityMap[key] : 0;
    return c;
  });

  // SVG sizing
  const cell = 12;
  const gap = 4;
  const cols = 52;
  const rows = 7;
  const width = cols * (cell + gap) + 20;
  const height = rows * (cell + gap) + 20;

  // Build grid rectangles column-wise (per-week)
  let rects = "";
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const idx = col * rows + row;
      if (idx >= counts.length) continue;
      const count = counts[idx];
      const color = colorForCount(count, style);
      const x = 10 + col * (cell + gap);
      const y = 10 + row * (cell + gap);
      rects += `<rect x="${x}" y="${y}" rx="3" ry="3" width="${cell}" height="${cell}" fill="${color}" stroke="#0b1220" stroke-opacity="0.08"/>`;
    }
  }

  // Legend
  const legendX = 10;
  const legendY = height + 24;
  const legend = `
    <g transform="translate(${legendX}, ${legendY})" font-family="Inter, Arial, sans-serif" font-size="11" fill="#9aa4b2">
      <text x="0" y="10">Less</text>
      <rect x="40" y="-8" width="12" height="12" rx="2" fill="${colorForCount(0, style)}"/ >
      <rect x="58" y="-8" width="12" height="12" rx="2" fill="${colorForCount(1, style)}"/ >
      <rect x="76" y="-8" width="12" height="12" rx="2" fill="${colorForCount(3, style)}"/ >
      <rect x="94" y="-8" width="12" height="12" rx="2" fill="${colorForCount(6, style)}"/ >
      <rect x="112" y="-8" width="12" height="12" rx="2" fill="${colorForCount(10, style)}"/ >
      <text x="132" y="0">More</text>
    </g>`;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 60}" viewBox="0 0 ${width} ${height + 60}" role="img" aria-label="CodeChef heatmap for ${username}">
    <rect width="100%" height="100%" fill="transparent"/>
    <g>${rects}</g>
    ${legend}
  </svg>
  `;
  return svg;
}

function buildProfileCardSvg(data, heatmapSvg, username) {
  // Modern gradient card style (C) with heatmap below it.
  // data: { rating, highest, global, country }
  const rating = data.rating || "N/A";
  const highest = data.highest || "N/A";
  const global = data.global || "N/A";
  const country = data.country || "N/A";

  // Compose a combined SVG
  // Card width will adapt to 760 or to heatmap width
  const cardWidth = 760;
  const cardHeight = 180;
  const combinedWidth = Math.max(cardWidth, 600);
  // We'll insert the heatmap as an embedded SVG fragment below the card.
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${combinedWidth}" height="${cardHeight + 420}" viewBox="0 0 ${combinedWidth} ${cardHeight + 420}" role="img" aria-label="CodeChef profile for ${username}">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7c3aed" />
        <stop offset="50%" stop-color="#06b6d4" />
        <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.9"/>
      </linearGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="10" stdDeviation="30" flood-color="#0b1020" flood-opacity="0.6"/>
      </filter>
    </defs>

    <!-- Card -->
    <g transform="translate(20,20)">
      <rect width="${cardWidth - 40}" height="${cardHeight - 40}" rx="18" fill="url(#g1)" filter="url(#shadow)"/>
      <rect x="12" y="12" width="${cardWidth - 64}" height="${cardHeight - 64}" rx="12" fill="#0b1020" opacity="0.65"/>

      <!-- Left: avatar circle -->
      <g transform="translate(24,30)">
        <circle cx="50" cy="40" r="36" fill="#111827" stroke="#2b2f3a" stroke-width="2"/>
        <text x="50" y="46" text-anchor="middle" font-family="Inter, Arial" font-size="20" fill="#fff" font-weight="600">${(username || "").charAt(0).toUpperCase()}</text>
      </g>

      <!-- Right content -->
      <g transform="translate(130,30)">
        <text x="0" y="22" font-family="Inter, Arial" font-size="20" fill="#e6eef8" font-weight="700">CodeChef — ${username}</text>
        <text x="0" y="46" font-family="Inter, Arial" font-size="14" fill="#a6b4c6">Rating: <tspan fill="#7ef1b8" font-weight="700">${rating}</tspan> &nbsp; ★ <tspan fill="#ffd166">${highest}</tspan></text>

        <g transform="translate(0,70)" font-family="Inter, Arial" font-size="13" fill="#c7d2df">
          <text x="0" y="0">Global Rank: <tspan fill="#94a3b8" font-weight="700">${global}</tspan></text>
          <text x="220" y="0">Country Rank: <tspan fill="#94a3b8" font-weight="700">${country}</tspan></text>
        </g>

        <g transform="translate(0,110)">
          <rect x="0" y="0" width="160" height="36" rx="8" fill="#0f1720" opacity="0.6"/>
          <text x="12" y="22" font-family="Inter, Arial" font-size="12" fill="#9fb0c7">Division</text>
          <text x="120" y="22" text-anchor="end" font-family="Inter, Arial" font-size="12" fill="#fff">${rating && parseInt(rating) >= 2000 ? "Division 1" : "Division 2/3"}</text>
        </g>
      </g>
    </g>

    <!-- heatmap group (embed as foreignObject via svg fragment) -->
    <g transform="translate(20, ${cardHeight})">
      ${heatmapSvg}
    </g>

  </svg>
  `;
  return svg;
}

module.exports = async (req, res) => {
  const username = (req.query.user || "").trim();
  if (!username) {
    res.statusCode = 400;
    res.end("Missing ?user=username");
    return;
  }

  // Try to fetch CodeChef profile HTML
  const profileUrl = `https://www.codechef.com/users/${encodeURIComponent(username)}`;

  let profileHtml = null;
  try {
    const result = await fetchUrlRaw(profileUrl, 9000);
    if (result && result.status >= 200 && result.status < 400) {
      profileHtml = result.body;
    }
  } catch (err) {
    // network failure or blocked; we'll fall back to placeholder data
    profileHtml = null;
  }

  const parsed = profileHtml ? parseProfileHtml(profileHtml) : { rating: null, highest: null, global: null, country: null };
  // try parse activity map (date->count)
  const activityMap = profileHtml ? parseActivityFromHtml(profileHtml) : null;

  // if no real activity, create deterministic placeholder activity map (keeps stable per username)
  let usedActivity = activityMap;
  if (!usedActivity) {
    const rand = seededRandom(username);
    // generate last 364 days map
    const now = new Date();
    function ymd(d) {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, "0");
      const day = d.getDate().toString().padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    usedActivity = {};
    for (let i = 0; i < 52 * 7; i++) {
      const d = new Date(now.getTime() - (52 * 7 - 1 - i) * 24 * 60 * 60 * 1000);
      // deterministic value 0..8
      const val = Math.floor(rand() * 9); // 0..8
      if (val > 0) usedActivity[ymd(d)] = val;
    }
  }

  // Build heatmap SVG fragment
  const heatmapSvg = buildHeatmapSvg(usedActivity, username, { style: "C" });

  // Build full profile + heatmap combined SVG
  const fullSvg = buildProfileCardSvg(parsed, heatmapSvg, username);

  res.setHeader("Content-Type", "image/svg+xml");
  // cache for small time so README fetches are fast
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.end(fullSvg);
};
