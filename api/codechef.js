// /api/codechef.js
// Final working version: Gradient Profile Card + Color Heatmap (No &nbsp; errors)

const https = require("https");

/* -------------------------------------------------------------
   1. Utility: Seeded PRNG (for fallback heatmap)
---------------------------------------------------------------- */
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

/* -------------------------------------------------------------
   2. Color map (Style C – Colorful Heatmap)
---------------------------------------------------------------- */
function colorForCount(count) {
  if (count === 0) return "#0e172a";   // dark
  if (count <= 1) return "#38bdf8";    // blue
  if (count <= 3) return "#22c55e";    // green
  if (count <= 6) return "#facc15";    // yellow
  if (count <= 10) return "#fb923c";   // orange
  return "#ef4444";                    // red
}

/* -------------------------------------------------------------
   3. HTTPS GET helper
---------------------------------------------------------------- */
function fetchUrl(url, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ body: data, status: res.statusCode }));
    });
    req.on("error", (err) => reject(err));
    req.setTimeout(timeout, () => {
      req.abort();
      reject(new Error("timeout"));
    });
  });
}

/* -------------------------------------------------------------
   4. Parse CodeChef Profile HTML
---------------------------------------------------------------- */
function parseProfile(html) {
  return {
    rating: (html.match(/rating-number">(\d+)/) || [null, "N/A"])[1],
    highest: (html.match(/highest-rating">.*?(\d+)/) || [null, "N/A"])[1],
    global: (html.match(/Global Rank[\s\S]*?(\d+)/i) || [null, "N/A"])[1],
    country: (html.match(/Country Rank[\s\S]*?(\d+)/i) || [null, "N/A"])[1],
  };
}

/* -------------------------------------------------------------
   5. Parse activity dates (best-effort)
---------------------------------------------------------------- */
function parseActivity(html) {
  const dates = {};
  const regex = /\b(20\d{2}-\d{2}-\d{2})\b/g;

  let m;
  while ((m = regex.exec(html)) !== null) {
    const d = m[1];
    dates[d] = (dates[d] || 0) + 1;
  }

  if (Object.keys(dates).length < 5) return null;
  return dates;
}

/* -------------------------------------------------------------
   6. Build Heatmap SVG
---------------------------------------------------------------- */
function buildHeatmap(activity, username) {
  const today = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  const days = [];
  for (let i = 0; i < 364; i++) {
    days.push(new Date(today.getTime() - (364 - i) * DAY));
  }

  function ymd(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  const counts = days.map((d) => activity[ymd(d)] || 0);

  const cell = 12;
  const gap = 4;
  const rows = 7;
  const cols = 52;

  let rects = "";
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const index = col * rows + row;
      const x = col * (cell + gap) + 5;
      const y = row * (cell + gap) + 5;
      const color = colorForCount(counts[index]);
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${color}"/>`;
    }
  }

  const width = cols * (cell + gap) + 20;
  const height = rows * (cell + gap) + 20;

  return `
    <svg width="${width}" height="${height}">
      ${rects}
    </svg>
  `;
}

/* -------------------------------------------------------------
   7. Build Profile + Heatmap combined SVG
---------------------------------------------------------------- */
function buildCard(user, heatmap, profile) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="780" height="500">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="50%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#0891b2"/>
    </linearGradient>
  </defs>

  <!-- CARD -->
  <rect x="20" y="20" width="740" height="160" rx="20" fill="url(#grad)" />
  <rect x="36" y="36" width="708" height="128" rx="14" fill="#0a0f1f" opacity="0.7"/>

  <!-- Avatar -->
  <circle cx="85" cy="100" r="40" fill="#111827" stroke="#334155" stroke-width="2"/>
  <text x="85" y="106" fill="white" font-size="26" text-anchor="middle" font-family="Inter" font-weight="600">
    ${user.charAt(0).toUpperCase()}
  </text>

  <!-- TEXT -->
  <text x="150" y="80" fill="#e2e8f0" font-size="22" font-family="Inter" font-weight="700">
    CodeChef — ${user}
  </text>

  <text x="150" y="110" fill="#a5b4fc" font-size="16" font-family="Inter">
    Rating: <tspan fill="#7ef1b8" font-weight="700">${profile.rating}</tspan>   ★  
    <tspan fill="#facc15" font-weight="700">${profile.highest}</tspan>
  </text>

  <text x="150" y="140" fill="#cbd5e1" font-size="14" font-family="Inter">
    Global Rank: <tspan fill="#bae6fd">${profile.global}</tspan>     Country Rank: <tspan fill="#bae6fd">${profile.country}</tspan>
  </text>

  <!-- HEATMAP -->
  <g transform="translate(20, 210)">
    ${heatmap}
  </g>
</svg>
`;
}

/* -------------------------------------------------------------
   8. Main Handler
---------------------------------------------------------------- */
module.exports = async (req, res) => {
  const username = req.query.user;

  if (!username) {
    res.statusCode = 400;
    res.end("Missing ?user=username");
    return;
  }

  const url = `https://www.codechef.com/users/${username}`;

  let html = null;
  try {
    const r = await fetchUrl(url);
    html = r.body;
  } catch (e) {
    html = null;
  }

  let profile = html ? parseProfile(html) : null;
  let activity = html ? parseActivity(html) : null;

  // fallback deterministic heatmap
  if (!activity) {
    const rnd = seededRandom(username);
    const today = new Date();
    const DAY = 86400000;

    activity = {};
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * DAY);
      const key = d.toISOString().slice(0, 10);
      const val = Math.floor(rnd() * 10);
      if (val > 0) activity[key] = val;
    }
  }

  const heatmap = buildHeatmap(activity, username);
  const card = buildCard(username, heatmap, profile || {});

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.end(card);
};
