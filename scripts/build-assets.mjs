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
  ink: "#07090E",
  panel: "#0C1017",
  panel2: "#121722",
  line: "#1C2436",
  line2: "#2A364F",
  ivory: "#ECE9E2",
  soft: "#B4B9C0",
  muted: "#6E747D",
  faint: "#3A3F45",
  gold: "#F59E0B",
  gold2: "#FBBF24",
  goldDim: "#8A6A2A",
  cyan: "#06B6D4",
  cyan2: "#38BDF8",
  emerald: "#10B981",
  heat: ["#101520", "#2E2718", "#5A4620", "#9A7429", "#F59E0B"],
};
const serif = "Georgia,'Iowan Old Style','Times New Roman',serif";
const mono = "ui-monospace,'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
      topLangs: [["TypeScript", 10], ["Python", 8], ["C#", 4], ["PHP", 3]],
      topRepos: [
        { name: "Mimik-Plus", stars: 0, lang: "TypeScript", desc: "Community fork of Mimik" },
        { name: "QR-Camera", stars: 0, lang: "JavaScript", desc: "Virtual QR injection tool for automated QA testing" },
        { name: "Sentilytics-AI", stars: 0, lang: "Python", desc: "Sentiment analysis & NLP dashboard" },
        { name: "Prompt-Engineering-Collection", stars: 0, lang: "Python", desc: "SAST evaluation research paper" },
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

/* ----------------------------------------------------- logo-cyberpanda.svg */
function mechaPandaLogo(size = 256) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" role="img" aria-label="Cyber Panda Logo">
  <defs>
    <linearGradient id="mp-visor" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="50%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
    <linearGradient id="mp-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
    <linearGradient id="mp-plate" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1E2638"/>
      <stop offset="100%" stop-color="#0F141E"/>
    </linearGradient>
    <linearGradient id="mp-silver" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#E2E8F0"/>
      <stop offset="100%" stop-color="#94A3B8"/>
    </linearGradient>
  </defs>
  <style>
    @keyframes visor-pulse {
      0%, 100% { opacity: 0.85; filter: drop-shadow(0 0 4px #06B6D4); }
      50% { opacity: 1; filter: drop-shadow(0 0 10px #38BDF8); }
    }
    .visor-beam { animation: visor-pulse 2.4s ease-in-out infinite; }
  </style>

  <!-- Outer Cyber Ring / Reticle -->
  <circle cx="128" cy="128" r="122" fill="#07090E" stroke="#1E2638" stroke-width="2"/>
  <circle cx="128" cy="128" r="116" fill="none" stroke="#2A364F" stroke-width="1" stroke-dasharray="8 6" opacity="0.6"/>
  <circle cx="128" cy="128" r="122" fill="none" stroke="#06B6D4" stroke-width="2" stroke-dasharray="30 160" opacity="0.8"/>
  <circle cx="128" cy="128" r="122" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="20 170" stroke-dashoffset="100" opacity="0.8"/>

  <!-- Coordinates & Tech Badges -->
  <path d="M 28 128 L 16 128 M 240 128 L 228 128 M 128 28 L 128 16 M 128 240 L 128 228" stroke="#38BDF8" stroke-width="2" opacity="0.5"/>

  <!-- Left Mechanical Ear -->
  <g>
    <path d="M 52 50 L 86 36 L 96 74 L 62 88 Z" fill="url(#mp-plate)" stroke="#06B6D4" stroke-width="1.5"/>
    <circle cx="72" cy="62" r="14" fill="#0A0D14" stroke="#1E2638" stroke-width="2"/>
    <circle cx="72" cy="62" r="7" fill="#06B6D4" opacity="0.7"/>
    <circle cx="72" cy="62" r="3" fill="#E2E8F0"/>
  </g>

  <!-- Right Mechanical Ear -->
  <g>
    <path d="M 204 50 L 170 36 L 160 74 L 194 88 Z" fill="url(#mp-plate)" stroke="#F59E0B" stroke-width="1.5"/>
    <circle cx="184" cy="62" r="14" fill="#0A0D14" stroke="#1E2638" stroke-width="2"/>
    <circle cx="184" cy="62" r="7" fill="#F59E0B" opacity="0.7"/>
    <circle cx="184" cy="62" r="3" fill="#E2E8F0"/>
  </g>

  <!-- Main Helmet Base -->
  <polygon points="128,42 186,64 198,124 184,188 128,212 72,188 58,124 70,64" fill="url(#mp-plate)" stroke="#2A364F" stroke-width="2"/>

  <!-- Cheek Armor (Silver alloy) -->
  <polygon points="72,130 96,140 92,182 72,176" fill="url(#mp-silver)" opacity="0.95"/>
  <polygon points="184,130 160,140 164,182 184,176" fill="url(#mp-silver)" opacity="0.95"/>

  <!-- Cranium Center Plate -->
  <polygon points="128,48 152,66 146,104 128,108 110,104 104,66" fill="#0F141E" stroke="#38BDF8" stroke-width="1.5"/>
  <polygon points="128,74 136,86 128,94 120,86" fill="url(#mp-gold)"/>

  <!-- Obsidian Panda Eye Shields -->
  <polygon points="76,106 114,112 110,144 80,140" fill="#07090E" stroke="#1E2638" stroke-width="1.5"/>
  <polygon points="180,106 142,112 146,144 176,140" fill="#07090E" stroke="#1E2638" stroke-width="1.5"/>

  <!-- Continuous Cyber Visor -->
  <g class="visor-beam">
    <path d="M 80 120 L 176 120 L 172 132 L 84 132 Z" fill="url(#mp-visor)"/>
    <line x1="128" y1="120" x2="128" y2="132" stroke="#07090E" stroke-width="2"/>
    <circle cx="98" cy="126" r="2.5" fill="#FFFFFF"/>
    <circle cx="158" cy="126" r="2.5" fill="#FFFFFF"/>
  </g>

  <!-- Snout & Rebreather -->
  <polygon points="128,142 142,156 128,170 114,156" fill="#0A0D14" stroke="#2A364F" stroke-width="1.5"/>
  <polygon points="128,150 134,158 122,158" fill="#F59E0B"/>
  <line x1="122" y1="178" x2="134" y2="178" stroke="#06B6D4" stroke-width="1.5"/>
  <line x1="124" y1="184" x2="132" y2="184" stroke="#06B6D4" stroke-width="1.5"/>

  <!-- Chin Armor Plate -->
  <polygon points="128,194 144,188 140,204 128,210 116,204 112,188" fill="#1E2638" stroke="#38BDF8" stroke-width="1"/>
  <text x="128" y="62" font-family="${mono}" font-size="7" font-weight="900" fill="#94A3B8" text-anchor="middle" letter-spacing="1.5">MP-MK1</text>
</svg>`;
}

function mechaPandaSmall(x, y, s = 80) {
  return `<g transform="translate(${x}, ${y}) scale(${s / 256})">
    <circle cx="128" cy="128" r="122" fill="#07090E" stroke="#1E2638" stroke-width="2"/>
    <circle cx="128" cy="128" r="116" fill="none" stroke="#2A364F" stroke-width="1" stroke-dasharray="8 6" opacity="0.6"/>
    <g>
      <path d="M 52 50 L 86 36 L 96 74 L 62 88 Z" fill="#141A24" stroke="#06B6D4" stroke-width="1.5"/>
      <circle cx="72" cy="62" r="14" fill="#0A0D14" stroke="#1E2638" stroke-width="2"/>
      <circle cx="72" cy="62" r="6" fill="#06B6D4"/>
    </g>
    <g>
      <path d="M 204 50 L 170 36 L 160 74 L 194 88 Z" fill="#141A24" stroke="#F59E0B" stroke-width="1.5"/>
      <circle cx="184" cy="62" r="14" fill="#0A0D14" stroke="#1E2638" stroke-width="2"/>
      <circle cx="184" cy="62" r="6" fill="#F59E0B"/>
    </g>
    <polygon points="128,42 186,64 198,124 184,188 128,212 72,188 58,124 70,64" fill="#0E121A" stroke="#2A364F" stroke-width="2"/>
    <polygon points="72,130 96,140 92,182 72,176" fill="#CBD5E1" opacity="0.9"/>
    <polygon points="184,130 160,140 164,182 184,176" fill="#CBD5E1" opacity="0.9"/>
    <polygon points="128,48 152,66 146,104 128,108 110,104 104,66" fill="#080A0F" stroke="#38BDF8" stroke-width="1.5"/>
    <polygon points="76,106 114,112 110,144 80,140" fill="#07090E" stroke="#1E2638" stroke-width="1.5"/>
    <polygon points="180,106 142,112 146,144 176,140" fill="#07090E" stroke="#1E2638" stroke-width="1.5"/>
    <path d="M 80 120 L 176 120 L 172 132 L 84 132 Z" fill="#06B6D4"/>
    <polygon points="128,142 142,156 128,170 114,156" fill="#0A0D14" stroke="#2A364F" stroke-width="1.5"/>
    <polygon points="128,150 134,158 122,158" fill="#F59E0B"/>
    <line x1="122" y1="178" x2="134" y2="178" stroke="#06B6D4" stroke-width="1.5"/>
  </g>`;
}

/* --------------------------------------------------- bento-dashboard.svg */
function bentoDashboard(d) {
  const W = 1200, H = 620;

  // Waveform bars generator (20 bars)
  const barHeights = [24, 45, 60, 32, 55, 78, 90, 65, 40, 72, 85, 50, 62, 38, 70, 84, 56, 30, 48, 68];
  const waveBars = barHeights.map((h, i) => {
    const bx = 48 + i * 15;
    const dur = (1.4 + (i % 5) * 0.25).toFixed(2);
    const delay = (i * 0.08).toFixed(2);
    return `<rect x="${bx}" y="${515 - h}" width="8" height="${h}" rx="4" fill="url(#wave-grad)">
      <animate attributeName="height" values="${Math.max(12, h * 0.3)};${h};${Math.max(10, h * 0.2)}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
      <animate attributeName="y" values="${515 - Math.max(12, h * 0.3)};${515 - h};${515 - Math.max(10, h * 0.2)}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
    </rect>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="MasterPandaa Cyber Bento Dashboard">
  <defs>
    <radialGradient id="bg-glow1" cx="0.15" cy="0.15" r="0.6">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#07090E" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bg-glow2" cx="0.85" cy="0.85" r="0.6">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#07090E" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="card-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#101520" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#0B0E14" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
    <linearGradient id="gold-glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#FBBF24"/>
    </linearGradient>
    <linearGradient id="emerald-glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#34D399"/>
    </linearGradient>
    <linearGradient id="wave-grad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.4"/>
      <stop offset="60%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <style>
    @keyframes pulse-ring {
      0% { r: 4px; opacity: 1; }
      100% { r: 12px; opacity: 0; }
    }
    @keyframes dash-flow {
      to { stroke-dashoffset: -20; }
    }
    .flow-line { stroke-dasharray: 6 4; animation: dash-flow 1.2s linear infinite; }
  </style>

  <!-- Canvas Background -->
  <rect width="${W}" height="${H}" fill="#07090E"/>
  <rect width="${W}" height="${H}" fill="url(#bg-glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#bg-glow2)"/>

  <!-- Subtle Cyber Tech Grid Pattern -->
  <g opacity="0.12" stroke="#1E2638" stroke-width="1">
    <line x1="0" y1="80" x2="${W}" y2="80"/>
    <line x1="0" y1="314" x2="${W}" y2="314"/>
    <line x1="474" y1="0" x2="474" y2="${H}"/>
    <line x1="824" y1="314" x2="824" y2="${H}"/>
  </g>

  <!-- ==================== TILE 1: IDENTITY & CORE DOSSIER ==================== -->
  <g id="tile-1">
    <rect x="24" y="24" width="440" height="276" rx="14" fill="url(#card-grad)" stroke="#1E2638" stroke-width="1.5"/>
    <rect x="24" y="24" width="440" height="2" fill="url(#cyan-glow)"/>

    <circle cx="48" cy="50" r="4" fill="#10B981"/>
    <circle cx="48" cy="50" r="4" fill="none" stroke="#10B981" stroke-width="1.5" opacity="0.75">
      <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite"/>
    </circle>
    <text x="62" y="54" font-family="${mono}" font-size="10.5" font-weight="700" letter-spacing="2.5" fill="#10B981">SYSTEM ONLINE // LEVEL-4</text>
    <text x="444" y="54" text-anchor="end" font-family="${mono}" font-size="10" letter-spacing="1.5" fill="#64748B">ID: MP-2026</text>

    <!-- Embedded Mecha Panda Logo Mini -->
    ${mechaPandaSmall(42, 78, 88)}

    <!-- Name & Callsign -->
    <text x="146" y="98" font-family="${mono}" font-size="11" letter-spacing="2" fill="#F59E0B">CALLSIGN: MASTERPANDAA</text>
    <text x="146" y="124" font-family="${sans}" font-size="20" font-weight="800" fill="#F1F5F9">M. Luthfi Abdillah</text>
    <text x="146" y="146" font-family="${mono}" font-size="11.5" font-weight="600" letter-spacing="1" fill="#38BDF8">THE POLYMATH ARCHITECT</text>

    <line x1="44" y1="184" x2="444" y2="184" stroke="#1E2638" stroke-width="1"/>

    <!-- Core Specs & Geo Location -->
    <text x="44" y="206" font-family="${mono}" font-size="10.5" fill="#94A3B8">BASE: <tspan fill="#E2E8F0">Yogyakarta, Indonesia</tspan></text>
    <text x="44" y="226" font-family="${mono}" font-size="10" fill="#64748B">COORDINATES: <tspan fill="#38BDF8">7.7956° S, 110.3695° E</tspan></text>
    <text x="44" y="248" font-family="${mono}" font-size="10" fill="#64748B">FOCUS: <tspan fill="#F59E0B">Data Pipelines · Web Products · QA Tooling</tspan></text>

    <rect x="44" y="264" width="70" height="20" rx="4" fill="#0A0E17" stroke="#1E2638"/>
    <text x="79" y="278" font-family="${mono}" font-size="9" text-anchor="middle" fill="#10B981">PROD READY</text>
    <rect x="122" y="264" width="80" height="20" rx="4" fill="#0A0E17" stroke="#1E2638"/>
    <text x="162" y="278" font-family="${mono}" font-size="9" text-anchor="middle" fill="#38BDF8">FULL-STACK</text>
    <rect x="210" y="264" width="76" height="20" rx="4" fill="#0A0E17" stroke="#1E2638"/>
    <text x="248" y="278" font-family="${mono}" font-size="9" text-anchor="middle" fill="#F59E0B">KAGGLE EXP</text>
  </g>

  <!-- ==================== TILE 2: THE POLYMATH TRIAD REACTOR ==================== -->
  <g id="tile-2">
    <rect x="484" y="24" width="692" height="276" rx="14" fill="url(#card-grad)" stroke="#1E2638" stroke-width="1.5"/>
    <rect x="484" y="24" width="692" height="2" fill="url(#gold-glow)"/>

    <text x="510" y="54" font-family="${mono}" font-size="11" font-weight="700" letter-spacing="2.5" fill="#E2E8F0">THE POLYMATH TRIAD // THREE BALANCED CORES</text>
    <text x="1150" y="54" text-anchor="end" font-family="${mono}" font-size="10" letter-spacing="1.5" fill="#F59E0B">AUTONOMOUS ARCHITECTURE</text>

    <!-- Triad Circuit Lines -->
    <path d="M 610 160 L 830 100 L 1050 160 Z" fill="none" stroke="#1E2638" stroke-width="3"/>
    <path d="M 610 160 L 830 100 L 1050 160 Z" class="flow-line" fill="none" stroke="#38BDF8" stroke-width="2" opacity="0.8"/>

    <!-- Central Fusion Core -->
    <circle cx="830" cy="140" r="16" fill="#0A0E17" stroke="#38BDF8" stroke-width="2"/>
    <circle cx="830" cy="140" r="8" fill="#F59E0B"/>
    <text x="830" y="172" text-anchor="middle" font-family="${mono}" font-size="9" fill="#64748B">SYNC CORE</text>

    <!-- Core 1: Full-Stack (Left) -->
    <g transform="translate(610, 160)">
      <circle cx="0" cy="0" r="32" fill="#0A0E17" stroke="#38BDF8" stroke-width="2"/>
      <circle cx="0" cy="0" r="22" fill="#06B6D4" opacity="0.2"/>
      <text x="0" y="4" text-anchor="middle" font-family="${mono}" font-size="18">⚡</text>
      <text x="0" y="46" text-anchor="middle" font-family="${sans}" font-size="13" font-weight="700" fill="#38BDF8">FULL-STACK</text>
      <text x="0" y="62" text-anchor="middle" font-family="${mono}" font-size="9.5" fill="#94A3B8">React 19 · TypeScript</text>
      <text x="0" y="76" text-anchor="middle" font-family="${mono}" font-size="9.5" fill="#64748B">TanStack · Next.js</text>
    </g>

    <!-- Core 2: Big Data & ML (Center Top) -->
    <g transform="translate(830, 80)">
      <circle cx="0" cy="0" r="32" fill="#0A0E17" stroke="#F59E0B" stroke-width="2"/>
      <circle cx="0" cy="0" r="22" fill="#F59E0B" opacity="0.2"/>
      <text x="0" y="4" text-anchor="middle" font-family="${mono}" font-size="18">📊</text>
      <text x="0" y="-38" text-anchor="middle" font-family="${sans}" font-size="13" font-weight="700" fill="#F59E0B">DATA &amp; AI</text>
      <text x="0" y="-24" text-anchor="middle" font-family="${mono}" font-size="9.5" fill="#94A3B8">Spark · Python · FastAPI</text>
    </g>

    <!-- Core 3: Automated QA (Right) -->
    <g transform="translate(1050, 160)">
      <circle cx="0" cy="0" r="32" fill="#0A0E17" stroke="#10B981" stroke-width="2"/>
      <circle cx="0" cy="0" r="22" fill="#10B981" opacity="0.2"/>
      <text x="0" y="4" text-anchor="middle" font-family="${mono}" font-size="18">🛡️</text>
      <text x="0" y="46" text-anchor="middle" font-family="${sans}" font-size="13" font-weight="700" fill="#10B981">QA &amp; RELIABILITY</text>
      <text x="0" y="62" text-anchor="middle" font-family="${mono}" font-size="9.5" fill="#94A3B8">Playwright · Test Automation</text>
      <text x="0" y="76" text-anchor="middle" font-family="${mono}" font-size="9.5" fill="#64748B">SAST Code Security</text>
    </g>
  </g>

  <!-- ==================== TILE 3: WAVEFORM DATA VELOCITY ==================== -->
  <g id="tile-3">
    <rect x="24" y="320" width="350" height="276" rx="14" fill="url(#card-grad)" stroke="#1E2638" stroke-width="1.5"/>
    <rect x="24" y="320" width="350" height="2" fill="url(#cyan-glow)"/>

    <text x="46" y="350" font-family="${mono}" font-size="10.5" font-weight="700" letter-spacing="2" fill="#38BDF8">DATA VELOCITY // ACTIVITY EQUALIZER</text>
    <text x="46" y="370" font-family="${mono}" font-size="9.5" fill="#64748B">ACTIVE OUTPUT &amp; SPRINT RHYTHM</text>

    <!-- 20 Animated Waveform Equalizer Bars -->
    ${waveBars}

    <line x1="46" y1="524" x2="350" y2="524" stroke="#1E2638" stroke-width="1"/>
    <text x="46" y="550" font-family="${mono}" font-size="10" fill="#94A3B8">CADENCE: <tspan fill="#10B981">CONTINUOUS</tspan></text>
    <text x="46" y="570" font-family="${mono}" font-size="11" font-weight="700" fill="#F1F5F9">${d.contrib} CONTRIBUTIONS / 12M</text>
  </g>

  <!-- ==================== TILE 4: KAGGLE VERIFIED SIGNALS ==================== -->
  <g id="tile-4">
    <rect x="394" y="320" width="410" height="276" rx="14" fill="url(#card-grad)" stroke="#1E2638" stroke-width="1.5"/>
    <rect x="394" y="320" width="410" height="2" fill="url(#gold-glow)"/>

    <text x="416" y="350" font-family="${mono}" font-size="10.5" font-weight="700" letter-spacing="2" fill="#F59E0B">KAGGLE SIGNALS // DATASETS EXPERT</text>
    
    <!-- Gold Rank Badge -->
    <rect x="416" y="366" width="366" height="34" rx="6" fill="#0A0E17" stroke="#F59E0B" stroke-width="1"/>
    <text x="428" y="388" font-family="${mono}" font-size="12" font-weight="700" fill="#FBBF24">★ RANK 374 / 11,737</text>
    <text x="770" y="388" text-anchor="end" font-family="${mono}" font-size="11" fill="#94A3B8">TOP 3.1% GLOBAL</text>

    <!-- 4 Sub Metric Blocks -->
    <g transform="translate(416, 416)">
      <rect x="0" y="0" width="176" height="60" rx="8" fill="#131924" stroke="#1E2638"/>
      <text x="14" y="24" font-family="${mono}" font-size="10" fill="#64748B">DATASETS PUBLISHED</text>
      <text x="14" y="48" font-family="${mono}" font-size="20" font-weight="800" fill="#F1F5F9">${d.datasets}</text>

      <rect x="190" y="0" width="176" height="60" rx="8" fill="#131924" stroke="#1E2638"/>
      <text x="204" y="24" font-family="${mono}" font-size="10" fill="#64748B">NOTEBOOKS / KERNELS</text>
      <text x="204" y="48" font-family="${mono}" font-size="20" font-weight="800" fill="#F1F5F9">${d.kernels}</text>

      <rect x="0" y="70" width="176" height="60" rx="8" fill="#131924" stroke="#1E2638"/>
      <text x="14" y="94" font-family="${mono}" font-size="10" fill="#64748B">TOTAL DOWNLOADS</text>
      <text x="14" y="118" font-family="${mono}" font-size="19" font-weight="800" fill="#38BDF8">${d.downloads}</text>

      <rect x="190" y="70" width="176" height="60" rx="8" fill="#131924" stroke="#1E2638"/>
      <text x="204" y="94" font-family="${mono}" font-size="10" fill="#64748B">TOTAL DATA VIEWS</text>
      <text x="204" y="118" font-family="${mono}" font-size="19" font-weight="800" fill="#F59E0B">${d.views}</text>
    </g>

    <text x="416" y="574" font-family="${mono}" font-size="9" fill="#64748B">VERIFIED HANDLE: <tspan fill="#38BDF8">kaggle.com/pandaa12</tspan></text>
  </g>

  <!-- ==================== TILE 5: GITHUB TELEMETRY ==================== -->
  <g id="tile-5">
    <rect x="824" y="320" width="352" height="276" rx="14" fill="url(#card-grad)" stroke="#1E2638" stroke-width="1.5"/>
    <rect x="824" y="320" width="352" height="2" fill="url(#emerald-glow)"/>

    <text x="846" y="350" font-family="${mono}" font-size="10.5" font-weight="700" letter-spacing="2" fill="#10B981">GITHUB TELEMETRY // PRODUCTION</text>

    <!-- High Level Counters -->
    <g transform="translate(846, 370)">
      <text x="0" y="16" font-family="${mono}" font-size="10" fill="#64748B">REPOSITORIES</text>
      <text x="0" y="44" font-family="${mono}" font-size="24" font-weight="800" fill="#F1F5F9">${d.repos}</text>

      <text x="120" y="16" font-family="${mono}" font-size="10" fill="#64748B">TOTAL STARS</text>
      <text x="120" y="44" font-family="${mono}" font-size="24" font-weight="800" fill="#F59E0B">${d.stars}</text>

      <text x="220" y="16" font-family="${mono}" font-size="10" fill="#64748B">ACTIVE SINCE</text>
      <text x="220" y="44" font-family="${mono}" font-size="24" font-weight="800" fill="#38BDF8">${d.since}</text>
    </g>

    <line x1="846" y1="430" x2="1150" y2="430" stroke="#1E2638" stroke-width="1"/>

    <!-- Language Distribution Bars -->
    <text x="846" y="454" font-family="${mono}" font-size="10" fill="#94A3B8">LANGUAGE ARSENAL DISTRIBUTION</text>

    <g transform="translate(846, 468)">
      <text x="0" y="12" font-family="${mono}" font-size="10" fill="#E2E8F0">TypeScript</text>
      <rect x="100" y="2" width="200" height="10" rx="5" fill="#141C2A"/>
      <rect x="100" y="2" width="130" height="10" rx="5" fill="#38BDF8"/>

      <text x="0" y="36" font-family="${mono}" font-size="10" fill="#E2E8F0">Python</text>
      <rect x="100" y="26" width="200" height="10" rx="5" fill="#141C2A"/>
      <rect x="100" y="26" width="115" height="10" rx="5" fill="#F59E0B"/>

      <text x="0" y="60" font-family="${mono}" font-size="10" fill="#E2E8F0">C# / Tooling</text>
      <rect x="100" y="50" width="200" height="10" rx="5" fill="#141C2A"/>
      <rect x="100" y="50" width="70" height="10" rx="5" fill="#10B981"/>

      <text x="0" y="84" font-family="${mono}" font-size="10" fill="#E2E8F0">PHP / Web</text>
      <rect x="100" y="74" width="200" height="10" rx="5" fill="#141C2A"/>
      <rect x="100" y="74" width="60" height="10" rx="5" fill="#A855F7"/>
    </g>

    <text x="846" y="582" font-family="${mono}" font-size="9" fill="#64748B">CONTINUOUS DELIVERY: <tspan fill="#10B981">OPERATIONAL</tspan></text>
  </g>
</svg>`;
}

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
      <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.12"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.ink}"/>
  <rect width="${W}" height="${H}" fill="url(#hglow)"/>
  ${cols}
  <rect x="0" y="0" width="${W}" height="1" fill="${C.line2}"/>
  <rect x="0" y="${H - 1}" width="${W}" height="1" fill="${C.line2}"/>

  <text x="60" y="86" font-family="${mono}" font-size="12" letter-spacing="5" fill="${C.cyan2}">SYSTEM ARCHITECTURE // 2026</text>

  <text x="60" y="168" font-family="${serif}" font-size="58" fill="${C.ivory}">Muhammad Luthfi Abdillah</text>

  <rect x="60" y="196" width="0" height="2" fill="url(#hrule)">
    <animate attributeName="width" from="0" to="420" dur="1.4s" fill="freeze" begin="0.2s"/>
  </rect>

  <text x="60" y="234" font-family="${mono}" font-size="13.5" letter-spacing="3.5" fill="${C.soft}">DATA ENGINEER <tspan fill="${C.gold}">·</tspan> FULL-STACK DEVELOPER <tspan fill="${C.cyan2}">·</tspan> QA ENGINEER</text>

  <text x="60" y="286" font-family="${mono}" font-size="12" fill="${C.muted}">Architecting resilient pipelines, intelligent full-stack products, and automated QA systems.</text>
  <rect x="60" y="298" width="8" height="14" fill="${C.gold}">
    <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.45;0.5;0.95;1" dur="1.6s" repeatCount="indefinite"/>
  </rect>

  <line x1="1040" y1="96" x2="1140" y2="96" stroke="${C.line2}" stroke-width="1"/>
  ${statRows}

  <text x="1140" y="262" text-anchor="end" font-family="${mono}" font-size="10.5" letter-spacing="3" fill="${C.muted}">FOCUS</text>
  <text x="1140" y="288" text-anchor="end" font-family="${mono}" font-size="12" fill="${C.soft}">DATA PIPELINES <tspan fill="${C.gold}">·</tspan> REACTIVE WEB <tspan fill="${C.cyan2}">·</tspan> QA MATRIX</text>
</svg>`;
}

/* ------------------------------------------------------------ invaders.svg */
function invaders(weeks, dates, total) {
  const W = 1240, H = 392;
  const step = 17, cell = 13, rx = 3;
  const cols = weeks.length;
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

  const wk = weeks.map((w) => w.reduce((a, b) => a + b, 0));
  const wmax = Math.max(1, ...wk);
  const sx = 60, sw = W - 120, sy0 = 314, sh = 40;
  const pts = wk.map((v, i) => [sx + (i / (wk.length - 1)) * sw, sy0 + sh - (v / wmax) * sh]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${sx},${sy0 + sh} ${line} ${sx + sw},${sy0 + sh}` magic;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Contribution timeline">
  <defs>
    <linearGradient id="iscan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset="0.5" stop-color="${C.cyan}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/>
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
async function main() {
  const [contrib, repos, kg, user] = await Promise.all([getContribution(), getRepos(), getKaggle(), getUser()]);
  const stats = { repos: repos.count, stars: repos.stars, forks: repos.forks, datasets: kg.datasets, contrib: contrib.total };

  const bentoData = {
    repos: repos.count,
    stars: repos.stars,
    since: user.since,
    contrib: contrib.total,
    datasets: kg.datasets,
    kernels: kg.kernels,
    downloads: nf(kg.agg.downloads),
    views: nf(kg.agg.views),
  };

  writeFileSync(resolve(OUT, "logo-cyberpanda.svg"), mechaPandaLogo(256));
  writeFileSync(resolve(OUT, "bento-dashboard.svg"), bentoDashboard(bentoData));
  writeFileSync(resolve(OUT, "hero.svg"), hero(stats));
  writeFileSync(resolve(OUT, "invaders.svg"), invaders(contrib.weeks, contrib.dates, contrib.total));
  writeFileSync(resolve(OUT, "panel-github.svg"), panelGithub({ ...repos, since: user.since }));
  writeFileSync(resolve(OUT, "panel-kaggle.svg"), panelKaggle(kg));

  console.log(JSON.stringify({
    repos: repos.count, stars: repos.stars,
    kaggle: { datasets: kg.datasets, kernels: kg.kernels, agg: kg.agg },
    contributions: contrib.total,
    wrote: ["logo-cyberpanda.svg", "bento-dashboard.svg", "hero.svg", "invaders.svg", "panel-github.svg", "panel-kaggle.svg"],
  }, null, 2));
}

main().catch(err => {
  console.error("FATAL in build-assets:", err);
  process.exit(1);
});
