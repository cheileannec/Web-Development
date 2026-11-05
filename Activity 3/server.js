// Clash-themed GitHub Projects API
// Zero dependencies. Requires Node.js 18+ (built-in fetch).

import http from 'node:http';
import fs from 'node:fs';
import nodePath from 'node:path';

if (typeof fetch !== 'function') {
  console.error('Node.js 18 or newer is required (built-in fetch is missing).');
  process.exit(1);
}

// ---------- config (.env loader) ----------
try {
  for (const line of fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env file, that's fine */ }

const PORT = Number(process.env.PORT) || 3000;
const USER = (process.env.GITHUB_USERNAME || '').trim();
const TOKEN = (process.env.GITHUB_TOKEN || '').trim(); // optional, raises the rate limit
const CACHE_MS = 10 * 60 * 1000;

// The troop pages work without a GitHub username. Only the /village and /projects style
// endpoints need it, so we warn instead of quitting.
const GH_READY = Boolean(USER) && USER !== 'your-github-username';
if (!GH_READY) {
  console.warn('Note: GITHUB_USERNAME is not set in .env, so the GitHub endpoints (/village, /projects...) are disabled.');
}

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- GitHub fetch + cache ----------
const cache = new Map();
async function gh(path) {
  if (!GH_READY) throw new HttpError(503, 'GitHub endpoints are disabled. Set GITHUB_USERNAME in your .env file.');
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let res;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'coc-github-api',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });
  } catch {
    throw new HttpError(502, 'Could not reach GitHub. Check your internet connection and try again.');
  }

  if (!res.ok) {
    if (res.status === 404) throw new HttpError(404, `GitHub user "${USER}" was not found. Check GITHUB_USERNAME in your .env file.`);
    if (res.status === 401) throw new HttpError(401, 'Your GITHUB_TOKEN is invalid or expired.');
    if (res.status === 403 || res.status === 429) throw new HttpError(429, 'GitHub rate limit reached. Add a GITHUB_TOKEN to your .env file or try again later.');
    throw new HttpError(502, `GitHub API error (${res.status}).`);
  }

  const data = await res.json();
  cache.set(path, { at: Date.now(), data });
  return data;
}

async function getRepos() {
  const all = [];
  for (let page = 1; page <= 5; page++) { // up to 500 repos
    const batch = await gh(`/users/${USER}/repos?per_page=100&sort=pushed&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// ---------- Clash theme mapping ----------
const TROOPS = {
  JavaScript: 'Goblin', TypeScript: 'Archer', Python: 'Wizard', Java: 'Giant',
  'C++': 'P.E.K.K.A', C: 'Golem', 'C#': 'Valkyrie', Go: 'Hog Rider',
  Rust: 'Barbarian', PHP: 'Balloon', Ruby: 'Healer', Kotlin: 'Dragon',
  Swift: 'Baby Dragon', Dart: 'Minion', HTML: 'Wall Breaker', CSS: 'Lava Hound',
  Shell: 'Miner', Lua: 'Witch', 'Jupyter Notebook': 'Electro Dragon',
};
const troopFor = (lang) => TROOPS[lang] ?? 'Builder';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const power = (r) => r.stargazers_count * 3 + r.forks_count * 2 + r.watchers_count;
const levelOf = (r) => clamp(1 + Math.floor(Math.log2(1 + power(r))), 1, 15);
const rarityOf = (lvl) => (lvl >= 10 ? 'Legendary' : lvl >= 7 ? 'Epic' : lvl >= 4 ? 'Rare' : 'Common');

// Picture of each troop: if ./images has a file named after the repo (e.g. my-app.png) it is used.
// Otherwise the auto-generated preview image of the repository is used.
const IMG_DIR = new URL('./images/', import.meta.url);
const IMG_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
function imageFor(r) {
  try {
    const file = fs.readdirSync(IMG_DIR).find(
      (n) => nodePath.parse(n).name.toLowerCase() === r.name.toLowerCase() && IMG_TYPES[nodePath.extname(n).toLowerCase()],
    );
    if (file) return `/images/${encodeURIComponent(file)}`;
  } catch { /* no images folder, that's fine */ }
  return `https://opengraph.githubassets.com/1/${r.full_name}`;
}

function toTroop(r) {
  const level = levelOf(r);
  return {
    id: r.id,
    name: r.name,
    troop: troopFor(r.language),
    level,
    rarity: rarityOf(level),
    trophies: r.stargazers_count, // stars
    elixir: r.forks_count,        // forks
    gold: r.watchers_count,       // watchers
    description: r.description ?? 'No description yet.',
    language: r.language,
    topics: r.topics ?? [],
    archived: r.archived,
    lastBattle: r.pushed_at,
    createdAt: r.created_at,
    url: r.html_url,
    homepage: r.homepage || null,
    image: imageFor(r),
  };
}

async function getTroops({ includeForks = false } = {}) {
  const repos = await getRepos();
  return repos.filter((r) => includeForks || !r.fork).map(toTroop);
}

// ---------- characters (the 15 troops in characters.json) ----------
// Picture lookup: put a file named after the troop's id in ./images, for example
// barbarian.png, wall-breaker.jpg, pekka.webp (see /characters for every id).
const slugify = (name) => name.toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function loadCharacters() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(new URL('./characters.json', import.meta.url), 'utf8'));
  } catch (e) {
    throw new HttpError(500, `characters.json could not be read: ${e.message}`);
  }
  let files = [];
  try { files = fs.readdirSync(IMG_DIR); } catch { /* no images folder yet */ }
  return raw.map((c, i) => {
    const id = slugify(c.name);
    const file = files.find((n) => nodePath.parse(n).name.toLowerCase() === id && IMG_TYPES[nodePath.extname(n).toLowerCase()]);
    return {
      number: i + 1,
      id,
      ...c,
      attack: `${c.attackType} (${c.layer})`,
      image: file ? `/images/${encodeURIComponent(file)}` : null,
    };
  });
}

// ---------- routes ----------
const routes = {
  async '/characters'(q) {
    let list = loadCharacters();
    const search = (q.get('q') || '').trim().toLowerCase();
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search) || c.description.toLowerCase().includes(search));
    for (const [param, field] of [['target', 'target'], ['type', 'attackType'], ['layer', 'layer']]) {
      const v = (q.get(param) || '').toLowerCase();
      if (v) list = list.filter((c) => c[field].toLowerCase() === v);
    }
    return { count: list.length, characters: list };
  },

  async '/'() {
    return {
      message: GH_READY ? `Welcome to ${USER}'s village!` : 'Welcome to the village!',
      endpoints: {
        '/characters': 'All 15 troops (?q=search, ?target=Any|Resources|Defenses|Walls, ?type=Melee|Ranged|..., ?layer=Ground)',
        '/characters/:id': 'A single troop, e.g. /characters/baby-dragon',
        '/village': 'Your profile as a village (Town Hall level, total trophies)',
        '/projects': 'All projects as troops (?language=, ?sort=trophies|level|recent, ?forks=true)',
        '/projects/:name': 'A single project',
        '/trending': 'Top 5 strongest projects',
        '/clan': 'Languages grouped as troop types',
        '/leaderboard': 'Projects ranked by trophies',
        '/health': 'Status check',
      },
    };
  },

  async '/health'() {
    return { status: 'ok', time: new Date().toISOString() };
  },

  async '/village'() {
    const [u, troops] = await Promise.all([gh(`/users/${USER}`), getTroops()]);
    const trophies = troops.reduce((s, t) => s + t.trophies, 0);
    const elixir = troops.reduce((s, t) => s + t.elixir, 0);
    const townHall = clamp(1 + Math.floor(Math.log2(1 + trophies * 3 + elixir * 2 + u.followers)), 1, 16);
    return {
      chief: u.name ?? u.login,
      tag: `#${u.login}`,
      avatar: u.avatar_url,
      bio: u.bio,
      townHallLevel: townHall,
      trophies,
      elixir,
      troopsTrained: troops.length,
      clanMembers: u.followers,
      allies: u.following,
      villageFounded: u.created_at,
      url: u.html_url,
    };
  },

  async '/projects'(q) {
    let list = await getTroops({ includeForks: q.get('forks') === 'true' });
    const lang = q.get('language');
    if (lang) list = list.filter((t) => t.language?.toLowerCase() === lang.toLowerCase());
    const sort = q.get('sort');
    if (sort === 'trophies') list.sort((a, b) => b.trophies - a.trophies);
    else if (sort === 'level') list.sort((a, b) => b.level - a.level || b.trophies - a.trophies);
    else if (sort === 'recent') list.sort((a, b) => new Date(b.lastBattle) - new Date(a.lastBattle));
    return { count: list.length, projects: list };
  },

  async '/trending'() {
    const list = (await getTroops()).sort((a, b) => b.level - a.level || b.trophies - a.trophies);
    return { projects: list.slice(0, 5) };
  },

  async '/clan'() {
    const list = await getTroops();
    const groups = {};
    for (const t of list) {
      const key = t.language ?? 'Unknown';
      (groups[key] ??= { language: key, troop: t.troop, count: 0, projects: [] });
      groups[key].count++;
      groups[key].projects.push(t.name);
    }
    return { troopTypes: Object.values(groups).sort((a, b) => b.count - a.count) };
  },

  async '/leaderboard'() {
    const list = (await getTroops()).sort((a, b) => b.trophies - a.trophies);
    return { leaderboard: list.map((t, i) => ({ rank: i + 1, name: t.name, troop: t.troop, trophies: t.trophies, level: t.level })) };
  },
};
routes['/api'] = routes['/']; // list of endpoints (JSON)

// ---------- server ----------
const CORS = {
  'Access-Control-Allow-Origin': '*', // so a portfolio website can call this API
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(body, null, 2));
};
const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { throw new HttpError(400, 'Malformed URL.'); }
};

// Two HTML pages: index.html (list) and view.html (details of one troop).
// A browser opening "/" gets index.html; the JSON info lives at "/api".
const PAGE_FILES = { '/index.html': 'index.html', '/view.html': 'view.html', '/view': 'view.html' };

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method !== 'GET') throw new HttpError(405, 'Only GET requests are allowed.');

    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // HTML pages
    const wantsHtml = (req.headers.accept || '').includes('text/html');
    const pageFile = PAGE_FILES[path] ?? (path === '/' && wantsHtml ? 'index.html' : null);
    if (pageFile) {
      try {
        const html = fs.readFileSync(new URL(`./${pageFile}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch { /* file missing, fall through to JSON */ }
    }

    // Static pictures from ./images
    const imgMatch = path.match(/^\/images\/([^/]+)$/);
    if (imgMatch) {
      const name = nodePath.basename(safeDecode(imgMatch[1]));
      const type = IMG_TYPES[nodePath.extname(name).toLowerCase()];
      try {
        if (!type) throw new Error('unsupported file type');
        const data = fs.readFileSync(new URL(name, IMG_DIR));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=300' });
        return res.end(data);
      } catch {
        throw new HttpError(404, 'Picture not found.');
      }
    }

    if (routes[path]) return send(res, 200, await routes[path](url.searchParams));

    const cm = path.match(/^\/characters\/([^/]+)$/);
    if (cm) {
      const id = safeDecode(cm[1]).toLowerCase();
      const found = loadCharacters().find((c) => c.id === id);
      if (!found) throw new HttpError(404, 'No troop with that id.');
      return send(res, 200, found);
    }

    const m = path.match(/^\/projects\/([^/]+)$/);
    if (m) {
      const name = safeDecode(m[1]).toLowerCase();
      const found = (await getTroops({ includeForks: true })).find((t) => t.name.toLowerCase() === name);
      if (!found) throw new HttpError(404, 'No troop with that name.');
      return send(res, 200, found);
    }

    throw new HttpError(404, 'Route not found. See /api for the list of endpoints.');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Internal server error.' });
  }
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set a different PORT in .env.` : e.message);
  process.exit(1);
});

server.listen(PORT, () => console.log(`Village API is running at http://localhost:${PORT}`));