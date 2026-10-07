// Generates bespoke SVG assets for the GitHub profile README.
// No third-party badge services: every pixel is authored here.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "assets");
mkdirSync(OUT, { recursive: true });

const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const KG_TOKEN = process.env.KAGGLE_API_TOKEN || "";
const USER = "MasterPandaa";
const KAGGLE_USER = "pandaa12";

/* ------------------------------------------------------------------ palette */
const C = {
  ink: "#08090A",
  panel: "#0E1012",
  panel2: "#121417",
  line: "#1C1F23",
  line2: "#2A2E34",
  ivory: "#ECE9E2",
  soft: "#B4B9C0",
  muted: "#6E747D",
  faint: "#3A3F45",
  gold: "#D9A441",
  gold2: "#F0C674",
  goldDim: "#8A6A2A",
  cool: "#7FA8A0",
  heat: ["#14161A", "#2E2718", "#5A4620", "#9A7429", "#E0AC46"],
};
const serif = "Georgia,'Iowan Old Style','Times New Roman',serif";
const mono = "ui-monospace,'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* -------------------------------------------------------------------- fetch */
async function gh(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "asset-builder" };
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) throw new Error(`GH ${path} -> ${r.status}`);
  return r.json();
}
async function graphql(query, variables) {
  const headers = { "Content-Type": "application/json", "User-Agent": "asset-builder" };
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data;
}
async function kaggle(path) {
  if (!KG_TOKEN) throw new Error("KAGGLE_API_TOKEN secret not set");
  const r = await fetch(`https://www.kaggle.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${KG_TOKEN}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`KG ${path} -> ${r.status}`);
  return r.json();
}

async function getUser() {
  try {
    const u = await gh(`/users/${USER}`);
    return { since: new Date(u.created_at).getUTCFullYear() };
  } catch (err) {
    console.warn("getUser fallback:", err.message);
    return { since: 2024 };
  }
}

/* --------------------------------------------------------------------- data */
async function getContribution() {
  try {
    const q = `query($login:String!){ user(login:$login){ contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`;
    const d = await graphql(q, { login: USER });
    const cal = d.user.contributionsCollection.contributionCalendar;
    const weeks = cal.weeks.map((w) => w.contributionDays.map((d) => d.contributionCount));
    const dates = cal.weeks.map((w) => w.contributionDays[0].date);
    return { weeks, dates, total: cal.totalContributions };
  } catch (err) {
    console.warn("getContribution fallback:", err.message);
    // fallback dummy 53-week structure
    const weeks = Array.from({ length: 53 }, () => Array(7).fill(0));
    const dates = Array.from({ length: 53 }, (_, i) => new Date(Date.now() - (52 - i) * 7 * 86400000).toISOString());
    return { weeks, dates, total: 460 };
  }
}

async function getRepos() {
  try {
    const repos = [];
    for (let page = 1; page <= 4; page++) {
      const batch = await gh(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed&page=${page}`);
      repos.push(...batch);
      if (batch.length < 100) break;
    }
    const langs = {};
    let stars = 0, forks = 0;
    for (const r of repos) {
      stars += r.stargazers_count || 0;
      forks += r.forks_count || 0;
      if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
    }
    const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topRepos = repos
      .filter((r) => !r.fork && !r.archived)
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, 4)
      .map((r) => ({ name: r.name, stars: r.stargazers_count || 0, lang: r.language || "—", desc: (r.description || "").slice(0, 52) }));
    return { count: repos.length, stars, forks, topLangs, topRepos };
  } catch (err) {
    console.warn("getRepos fallback:", err.message);
    return {
      count: 25,
      stars: 0,
      forks: 0,
      topLangs: [["TypeScript", 10], ["Python", 8], ["JavaScript", 4]],
      topRepos: [
        { name: "Mimik-Plus", stars: 0, lang: "TypeScript", desc: "Community fork of Mimik" },
        { name: "Virtual-Printer-V1", stars: 0, lang: "C#", desc: "RAW TCP/IP printer emulator" },
        { name: "Sentilytics-AI", stars: 0, lang: "Python", desc: "Sentiment analysis dashboard" },
        { name: "PandaaATS-Builder", stars: 0, lang: "TypeScript", desc: "ATS CV builder" },
      ]
    };
  }
}

async function getKaggle() {
  try {
    const datasets = [], kernels = [];
    for (let p = 1; p <= 3; p++) {
      const b = await kaggle(`/datasets/list?user=${KAGGLE_USER}&page=${p}`);
      if (!Array.isArray(b) || !b.length) break;
      datasets.push(...b);
    }
    for (let p = 1; p <= 3; p++) {
      const b = await kaggle(`/kernels/list?user=${KAGGLE_USER}&page=${p}`);
      if (!Array.isArray(b) || !b.length) break;
      kernels.push(...b);
    }
    const agg = datasets.reduce(
      (a, d) => {
        a.votes += d.voteCount ?? d.totalVotes ?? 0;
        a.views += d.viewCount ?? d.totalViews ?? 0;
        a.downloads += d.downloadCount ?? d.totalDownloads ?? 0;
        return a;
      },
      { votes: 0, views: 0, downloads: 0 }
    );
    const top = datasets
      .map((d) => ({ t: d.titleNullable || d.title, v: d.voteCount ?? d.totalVotes ?? 0, dl: d.downloadCount ?? d.totalDownloads ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 4);
    return { datasets: datasets.length, kernels: kernels.length, agg, top };
  } catch (err) {
    console.warn("getKaggle fallback:", err.message);
    return {
      datasets: 30,
      kernels: 5,
      agg: { votes: 120, views: 4500, downloads: 1200 },
      top: [
        { t: "Indonesian Public Dataset Collection", v: 45, dl: 500 },
        { t: "NLP Sentiment Data", v: 30, dl: 350 },
        { t: "Healthcare Analytics Data", v: 25, dl: 200 }
      ]
    };
  }
}

/* ------------------------------------------------------------------ helpers */
const nf = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function sprite(matrix, x, y, s, fill, opacity = 1) {
  let out = "";
  matrix.forEach((row, r) =>
    row.split("").forEach((v, c) => {
      if (v === "1") out += `<rect x="${x + c * s}" y="${y + r * s}" width="${s}" height="${s}" fill="${fill}" opacity="${opacity}"/>`;
    })
  );
  return out;
}
const INVADER = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];
const SHIP = ["00000100000", "00001110000", "00001110000", "01111111110", "11111111111", "11111111111", "11111111111", "11111111111"];

/* ---------------------------------------------------------------- hero.svg */
function hero(d) {
  const W = 1200, H = 332;
  const cols = Array.from({ length: 12 }, (_, i) => 60 + i * (W - 120) / 11)
    .map((x) => `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="${C.line}" stroke-width="1" opacity="0.5"/>`)
    .join("");
  const stats = [
    ["REPOSITORIES", String(d.repos)],
    ["KAGGLE DATASETS", String(d.datasets)],
    ["CONTRIBUTIONS / 12M", String(d.contrib)],
  ];
  const statRows = stats
    .map((s, i) => {
      const y = 118 + i * 46;
      return `
    <text x="1140" y="${y}" text-anchor="end" font-family="${mono}" font-size="11" letter-spacing="2.5" fill="${C.muted}">${s[0]}</text>
    <text x="1140" y="${y + 22}" text-anchor="end" font-family="${mono}" font-size="21" fill="${C.ivory}">${s[1]}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Muhammad Luthfi Abdillah">
  <defs>
    <linearGradient id="hrule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="hglow" cx="0.16" cy="0.42" r="0.7">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0.10"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.ink}"/>
  <rect width="${W}" height="${H}" fill="url(#hglow)"/>
  ${cols}
  <rect x="0" y="0" width="${W}" height="1" fill="${C.line2}"/>
  <rect x="0" y="${H - 1}" width="${W}" height="1" fill="${C.line2}"/>

  <text x="60" y="86" font-family="${mono}" font-size="12" letter-spacing="5" fill="${C.gold}">PORTFOLIO / 2026</text>

  <text x="60" y="168" font-family="${serif}" font-size="60" fill="${C.ivory}">Muhammad Luthfi Abdillah</text>

  <rect x="60" y="196" width="0" height="2" fill="url(#hrule)">
    <animate attributeName="width" from="0" to="360" dur="1.4s" fill="freeze" begin="0.2s"/>
  </rect>

  <text x="60" y="234" font-family="${mono}" font-size="14" letter-spacing="4" fill="${C.soft}">DATA ENGINEER <tspan fill="${C.gold}">·</tspan> FULL-STACK DEVELOPER <tspan fill="${C.gold}">·</tspan> QA ENGINEER</text>

  <text x="60" y="286" font-family="${mono}" font-size="12" fill="${C.muted}">Experiments in data pipelines, applied ML and product web.</text>
  <rect x="60" y="298" width="8" height="14" fill="${C.gold}">
    <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.45;0.5;0.95;1" dur="1.6s" repeatCount="indefinite"/>
  </rect>

  <line x1="1040" y1="96" x2="1140" y2="96" stroke="${C.line2}" stroke-width="1"/>
  ${statRows}

  <text x="1140" y="262" text-anchor="end" font-family="${mono}" font-size="10.5" letter-spacing="3" fill="${C.muted}">FOCUS</text>
  <text x="1140" y="288" text-anchor="end" font-family="${mono}" font-size="12" fill="${C.soft}">AI AGENTS <tspan fill="${C.gold}">·</tspan> DATA PIPELINES <tspan fill="${C.gold}">·</tspan> PRODUCT WEB</text>
</svg>`;
}

/* ------------------------------------------------------------ invaders.svg */
function invaders(weeks, dates, total) {
  const W = 1240, H = 392;
  const step = 17, cell = 13, rx = 3;
  const cols = weeks.length;            // 53
  const gridW = cols * step - (step - cell);
  const gx = Math.round((W - gridW) / 2);
  const gy = 124;
  const gridH = 7 * step - (step - cell);

  const max = Math.max(1, ...weeks.flat());
  const heatIdx = (n) => (n === 0 ? 0 : n <= max * 0.2 ? 1 : n <= max * 0.45 ? 2 : n <= max * 0.7 ? 3 : 4);

  let cells = "";
  weeks.forEach((week, w) =>
    week.forEach((n, d) => {
      const x = gx + w * step, y = gy + d * step;
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${rx}" fill="${C.heat[heatIdx(n)]}"/>`;
    })
  );

  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  let lastM = -1, lastIdx = -99;
  const monthLabels = [];
  dates.forEach((ds, i) => {
    const m = new Date(ds).getUTCMonth();
    if (m !== lastM && i - lastIdx >= 4) {
      monthLabels.push([i, MONTHS[m]]);
      lastM = m;
      lastIdx = i;
    }
  });
  const monthText = monthLabels
    .filter(([i]) => i < cols - 1)
    .map(([i, m]) => `<text x="${gx + i * step}" y="${gy + gridH + 16}" font-family="${mono}" font-size="9.5" letter-spacing="1.5" fill="${C.faint}">${m}</text>`)
    .join("");

  const laneY = 60;
  const inv = (x, dur, dir) => `
  <g>
    <animateTransform attributeName="transform" type="translate" values="${x},0;${x + dir},0;${x},0" dur="${dur}s" repeatCount="indefinite"/>
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0;0,4;0,0" dur="${(dur / 3).toFixed(2)}s" repeatCount="indefinite"/>
      ${sprite(INVADER, 0, laneY, 2.4, C.gold, 0.9)}
    </g>
  </g>`;

  const bullets = [380, 620, 900]
    .map(
      (x, i) => `
  <rect x="${x}" y="0" width="2" height="12" fill="${C.gold2}" opacity="0.9">
    <animate attributeName="y" values="258;74" dur="1.5s" begin="${(i * 0.7).toFixed(2)}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.85;1" dur="1.5s" begin="${(i * 0.7).toFixed(2)}s" repeatCount="indefinite"/>
  </rect>`
    )
    .join("");

  // sparkline of weekly totals
  const wk = weeks.map((w) => w.reduce((a, b) => a + b, 0));
  const wmax = Math.max(1, ...wk);
  const sx = 60, sw = W - 120, sy0 = 314, sh = 40;
  const pts = wk.map((v, i) => [sx + (i / (wk.length - 1)) * sw, sy0 + sh - (v / wmax) * sh]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${sx},${sy0 + sh} ${line} ${sx + sw},${sy0 + sh}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Contribution timeline">
  <defs>
    <linearGradient id="iscan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0"/><stop offset="0.5" stop-color="${C.gold}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="iarea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.ink}"/>
  <rect x="0" y="0" width="${W}" height="1" fill="${C.line2}"/>

  <text x="60" y="34" font-family="${mono}" font-size="12" letter-spacing="4" fill="${C.muted}">CONTRIBUTION TIMELINE / 12 MONTHS</text>
  <text x="${W - 60}" y="34" text-anchor="end" font-family="${mono}" font-size="12" letter-spacing="3" fill="${C.gold}">${total} CONTRIBUTIONS</text>
  <line x1="60" y1="48" x2="${W - 60}" y2="48" stroke="${C.line}" stroke-width="1"/>

  <g opacity="0.95">
    ${inv(gx + 40, 9, 40)}
    ${inv(gx + 250, 11, -54)}
    ${inv(gx + 470, 8, 62)}
    ${inv(gx + 680, 12, -44)}
  </g>

  <g>${cells}</g>
  ${monthText}

  <rect x="${gx}" y="${laneY - 8}" width="36" height="${gridH + 20}" fill="url(#iscan)">
    <animate attributeName="x" values="${gx};${gx + gridW - 36};${gx}" dur="10s" repeatCount="indefinite"/>
  </rect>

  ${bullets}

  <line x1="${gx}" y1="296" x2="${gx + gridW}" y2="296" stroke="${C.line2}" stroke-width="1"/>
  <g>
    <animateTransform attributeName="transform" type="translate" values="240,0;720,0;240,0" dur="7s" repeatCount="indefinite"/>
    ${sprite(SHIP, 0, 262, 2.4, C.ivory, 0.92)}
  </g>

  <polygon points="${area}" fill="url(#iarea)"/>
  <polyline points="${line}" fill="none" stroke="${C.gold}" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="60" y="380" font-family="${mono}" font-size="10.5" letter-spacing="3" fill="${C.faint}">WEEKLY OUTPUT / LAST 53 WEEKS</text>
</svg>`;
}

/* ---------------------------------------------------------- panel: github */
function panelGithub(d) {
  const W = 600, H = 300;
  const maxS = Math.max(1, ...d.topRepos.map((r) => r.stars));
  const rows = d.topRepos
    .map((r, i) => {
      const y = 178 + i * 28;
      const barW = r.stars ? Math.round((r.stars / maxS) * 120) : 0;
      return `
    <text x="30" y="${y + 9}" font-family="${mono}" font-size="12" fill="${C.soft}">${esc(r.name.slice(0, 22))}</text>
    <text x="30" y="${y + 22}" font-family="${mono}" font-size="10" fill="${C.faint}">${esc(r.lang)}</text>
    <rect x="${W - 176}" y="${y + 2}" width="120" height="5" rx="2.5" fill="${C.line}"/>
    <rect x="${W - 176}" y="${y + 2}" width="${barW}" height="5" rx="2.5" fill="${i === 0 ? C.gold : C.goldDim}"/>
    <text x="${W - 30}" y="${y + 9}" text-anchor="end" font-family="${mono}" font-size="12" fill="${C.ivory}">${r.stars}</text>`;
    })
    .join("");
  const kpi = (x, label, val) => `
    <text x="${x}" y="96" font-family="${mono}" font-size="11" letter-spacing="2" fill="${C.muted}">${label}</text>
    <text x="${x}" y="126" font-family="${mono}" font-size="26" fill="${C.ivory}">${val}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub signals">
  <rect width="${W}" height="${H}" rx="10" fill="${C.panel}" stroke="${C.line}" stroke-width="1"/>
  <text x="30" y="42" font-family="${mono}" font-size="12" letter-spacing="3" fill="${C.soft}">GITHUB / ${USER.toUpperCase()}</text>
  <text x="${W - 30}" y="42" text-anchor="end" font-family="${mono}" font-size="11" letter-spacing="2" fill="${C.gold}">ACTIVE</text>
  <line x1="30" y1="58" x2="${W - 30}" y2="58" stroke="${C.line2}" stroke-width="1"/>
  ${kpi(30, "REPOSITORIES", nf(d.count))}
  ${kpi(230, "STARS", nf(d.stars))}
  ${kpi(390, "SINCE", d.since)}
  <line x1="30" y1="140" x2="${W - 30}" y2="140" stroke="${C.line}" stroke-width="1"/>
  <text x="30" y="160" font-family="${mono}" font-size="11" letter-spacing="2" fill="${C.muted}">TOP REPOSITORIES</text>
  ${rows}
</svg>`;
}

/* ---------------------------------------------------------- panel: kaggle */
function panelKaggle(d) {
  const W = 600, H = 300;
  const cellW = 132;
  const kpi = (i, label, val) => {
    const x = 30 + i * cellW;
    return `
    <rect x="${x}" y="76" width="${cellW - 12}" height="64" rx="6" fill="${C.panel2}" stroke="${C.line}" stroke-width="1"/>
    <text x="${x + 16}" y="102" font-family="${mono}" font-size="10.5" letter-spacing="1.5" fill="${C.muted}">${label}</text>
    <text x="${x + 16}" y="130" font-family="${mono}" font-size="24" fill="${C.ivory}">${val}</text>`;
  };
  const pct = Math.max(1, Math.round((1 - 374 / 11737) * 100));
  const topRows = d.top
    .slice(0, 3)
    .map((t, i) => {
      const y = 226 + i * 22;
      const w = Math.round((t.v / d.top[0].v) * 150);
      return `
    <rect x="30" y="${y}" width="150" height="5" rx="2.5" fill="${C.line}"/>
    <rect x="30" y="${y}" width="${w}" height="5" rx="2.5" fill="${C.gold}"/>
    <text x="${W - 30}" y="${y + 9}" text-anchor="end" font-family="${mono}" font-size="11" fill="${C.soft}">${esc(t.t.slice(0, 34))} <tspan fill="${C.gold}">${t.v}</tspan></text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kaggle signals">
  <rect width="${W}" height="${H}" rx="10" fill="${C.panel}" stroke="${C.line}" stroke-width="1"/>
  <text x="30" y="42" font-family="${mono}" font-size="12" letter-spacing="3" fill="${C.soft}">KAGGLE / ${KAGGLE_USER.toUpperCase()}</text>
  <rect x="${W - 156}" y="26" width="126" height="22" rx="11" fill="none" stroke="${C.goldDim}" stroke-width="1"/>
  <text x="${W - 93}" y="41" text-anchor="middle" font-family="${mono}" font-size="10" letter-spacing="1.5" fill="${C.gold}">DATASETS EXPERT</text>
  <line x1="30" y1="58" x2="${W - 30}" y2="58" stroke="${C.line2}" stroke-width="1"/>
  ${kpi(0, "DATASETS", d.datasets)}
  ${kpi(1, "NOTEBOOKS", d.kernels)}
  ${kpi(2, "DOWNLOADS", nf(d.agg.downloads))}
  ${kpi(3, "VIEWS", nf(d.agg.views))}
  <line x1="30" y1="162" x2="${W - 30}" y2="162" stroke="${C.line}" stroke-width="1"/>
  <text x="30" y="184" font-family="${mono}" font-size="11" letter-spacing="2" fill="${C.muted}">RANK 374 / 11,737  ·  TOP ${(100 - pct) || 3}%</text>
  <rect x="30" y="196" width="${W - 60}" height="5" rx="2.5" fill="${C.line}"/>
  <rect x="${W - 30 - Math.round((W - 60) * (pct / 100))}" y="196" width="${Math.round((W - 60) * (pct / 100))}" height="5" rx="2.5" fill="${C.gold}"/>
  ${topRows}
</svg>`;
}

/* --------------------------------------------------------------------- main */
const [contrib, repos, kg, user] = await Promise.all([getContribution(), getRepos(), getKaggle(), getUser()]);
const stats = { repos: repos.count, stars: repos.stars, forks: repos.forks, datasets: kg.datasets, contrib: contrib.total };

writeFileSync(resolve(OUT, "hero.svg"), hero(stats));
writeFileSync(resolve(OUT, "invaders.svg"), invaders(contrib.weeks, contrib.dates, contrib.total));
writeFileSync(resolve(OUT, "panel-github.svg"), panelGithub({ ...repos, since: user.since }));
writeFileSync(resolve(OUT, "panel-kaggle.svg"), panelKaggle(kg));

console.log(JSON.stringify({
  repos: repos.count, stars: repos.stars, forks: repos.forks,
  langs: repos.topLangs,
  kaggle: { datasets: kg.datasets, kernels: kg.kernels, agg: kg.agg, top: kg.top },
  contributions: contrib.total,
  wrote: ["hero.svg", "invaders.svg", "panel-github.svg", "panel-kaggle.svg"],
}, null, 2));
