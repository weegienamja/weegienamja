import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const USER = process.env.PROFILE_USER || 'weegienamja';
const TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const OUTPUT = 'assets/profile.svg';
const README = 'README.md';
const now = Date.now();

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': `${USER}-profile-generator`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clampText(value, max = 78) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function ageDays(iso) {
  return Math.max(0, (now - new Date(iso).getTime()) / 86_400_000);
}

function ageLabel(iso) {
  const d = ageDays(iso);
  if (d < 1) return 'TODAY';
  if (d < 2) return '1D AGO';
  if (d < 30) return `${Math.floor(d)}D AGO`;
  if (d < 365) return `${Math.floor(d / 30)}MO AGO`;
  return `${Math.floor(d / 365)}Y AGO`;
}

async function gh(path, allow404 = false) {
  const response = await fetch(`${API}${path}`, { headers });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`);
  return response.json();
}

async function loadRepos() {
  const repos = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await gh(`/users/${USER}/repos?per_page=100&page=${page}&sort=pushed&type=owner`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

function projectScore(repo) {
  const days = ageDays(repo.pushed_at || repo.updated_at);
  const freshness = Math.max(0, 58 - Math.log2(days + 1) * 9);
  const substance = Math.min(18, Math.log10((repo.size || 0) + 1) * 5.2);
  const stars = Math.min(12, (repo.stargazers_count || 0) * 2.5);
  const description = repo.description ? 6 : 0;
  const homepage = repo.homepage ? 3 : 0;
  return freshness + substance + stars + description + homepage;
}

async function enrichFeatured(repos) {
  const candidates = repos
    .filter((repo) => !repo.fork && !repo.archived && repo.name !== USER)
    .filter((repo) => (repo.size || 0) >= 20 || repo.description)
    .sort((a, b) => projectScore(b) - projectScore(a))
    .slice(0, 4);

  return Promise.all(candidates.map(async (repo) => {
    const release = await gh(`/repos/${USER}/${encodeURIComponent(repo.name)}/releases/latest`, true);
    return { ...repo, release };
  }));
}

function projectCard(repo, index) {
  const x = 78 + (index % 2) * 522;
  const y = 402 + Math.floor(index / 2) * 128;
  const language = repo.language || 'Mixed';
  const status = repo.release?.tag_name || ageLabel(repo.pushed_at || repo.updated_at);
  const desc = clampText(repo.description || 'Active public repository.', 72);
  const n = String(index + 1).padStart(2, '0');

  return `
  <g transform="translate(${x} ${y})">
    <rect width="486" height="104" rx="18" fill="#0B1017" stroke="#1C2734"/>
    <text x="20" y="27" class="mono tiny muted">${n} / ${esc(language).toUpperCase()}</text>
    <text x="20" y="55" class="sans project">${esc(repo.name)}</text>
    <text x="20" y="80" class="sans small muted">${esc(desc)}</text>
    <text x="392" y="27" text-anchor="end" class="mono tiny accent">${esc(status).toUpperCase()}</text>
    <circle cx="452" cy="23" r="4" fill="#70E1C8">
      <animate attributeName="opacity" values=".35;1;.35" dur="${3.4 + index * 0.55}s" repeatCount="indefinite"/>
    </circle>
  </g>`;
}

function buildSvg({ repos, featured }) {
  const publicRepos = repos.filter((r) => !r.fork && !r.archived && r.name !== USER);
  const active30 = publicRepos.filter((r) => ageDays(r.pushed_at || r.updated_at) <= 30).length;
  const latest = [...publicRepos].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))[0];
  const languages = [...new Set(featured.map((r) => r.language).filter(Boolean))];
  const cards = featured.map(projectCard).join('');
  const latestLabel = latest ? `${latest.name} · ${ageLabel(latest.pushed_at || latest.updated_at)}` : 'NO RECENT PUSH';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="690" viewBox="0 0 1200 690" role="img" aria-labelledby="title desc">
<title id="title">Jamie Blair — systems, networks and applied AI</title>
<desc id="desc">Live GitHub profile telemetry generated from Jamie Blair's public repositories.</desc>
<defs>
  <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#06080B"/><stop offset="1" stop-color="#0A0F15"/></linearGradient>
  <linearGradient id="accentLine" x1="0" x2="1"><stop offset="0" stop-color="#55C7FF" stop-opacity=".05"/><stop offset=".5" stop-color="#55C7FF" stop-opacity=".9"/><stop offset="1" stop-color="#70E1C8" stop-opacity=".05"/></linearGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#55C7FF" stop-opacity=".16"/><stop offset="1" stop-color="#55C7FF" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#8AA0B5" stroke-opacity=".055"/></pattern>
  <clipPath id="frameClip"><rect x="28" y="28" width="1144" height="634" rx="26"/></clipPath>
  <style>.sans{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mono{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace}.hero{font-size:58px;font-weight:700;letter-spacing:-2px;fill:#F4F7FA}.kicker{font-size:13px;font-weight:650;letter-spacing:2.4px;fill:#7F94A8}.lede{font-size:21px;font-weight:430;fill:#B9C5D0}.small{font-size:13px}.tiny{font-size:11px;letter-spacing:.9px}.muted{fill:#7F94A8}.accent{fill:#75D7FF}.project{font-size:18px;font-weight:650;fill:#EFF5F8}.metric{font-size:24px;font-weight:650;fill:#EEF5F8}.metricLabel{font-size:10px;letter-spacing:1.3px;fill:#6F8294}@media(prefers-reduced-motion:reduce){.motion{display:none}}</style>
</defs>
<rect width="1200" height="690" fill="url(#bg)"/><rect width="1200" height="690" fill="url(#grid)"/><circle cx="930" cy="135" r="300" fill="url(#glow)"/><rect x="28" y="28" width="1144" height="634" rx="26" fill="none" stroke="#1B2530"/>
<g clip-path="url(#frameClip)" class="motion" opacity=".55"><rect x="-260" y="28" width="180" height="634" fill="url(#accentLine)" opacity=".08"><animate attributeName="x" from="-260" to="1280" dur="11s" repeatCount="indefinite"/></rect></g>
<text x="78" y="82" class="mono kicker">JAMIE BLAIR / ENGINEERING PROFILE</text><text x="78" y="154" class="sans hero">Systems that make</text><text x="78" y="216" class="sans hero">infrastructure legible.</text><text x="78" y="262" class="sans lede">Networks · automation · applied AI · product systems</text>
<g transform="translate(786 72)"><rect width="336" height="214" rx="20" fill="#0A1016" stroke="#1E2A36"/><text x="22" y="34" class="mono tiny muted">LIVE / PUBLIC REPOSITORY TELEMETRY</text><path d="M24 95C75 61 119 128 171 92S267 50 312 87" fill="none" stroke="#2C4659" stroke-width="1.2"/><path d="M24 150C86 131 123 154 165 126S247 119 312 150" fill="none" stroke="#203746" stroke-width="1.2"/><g class="motion"><circle r="4" fill="#75D7FF"><animateMotion path="M24 95C75 61 119 128 171 92S267 50 312 87" dur="5.8s" repeatCount="indefinite"/></circle><circle r="3" fill="#70E1C8"><animateMotion path="M24 150C86 131 123 154 165 126S247 119 312 150" dur="7.2s" repeatCount="indefinite"/></circle></g><circle cx="24" cy="95" r="4" fill="#55C7FF"/><circle cx="171" cy="92" r="4" fill="#55C7FF"/><circle cx="312" cy="87" r="4" fill="#70E1C8"/><text x="24" y="189" class="mono tiny muted">LATEST PUSH</text><text x="312" y="189" text-anchor="end" class="mono tiny accent">${esc(clampText(latestLabel, 32)).toUpperCase()}</text></g>
<g transform="translate(78 316)"><line x1="0" y1="0" x2="1044" y2="0" stroke="#1B2732"/><g transform="translate(0 34)"><text class="mono metricLabel">PUBLIC SYSTEMS</text><text y="29" class="sans metric">${publicRepos.length}</text></g><g transform="translate(190 34)"><text class="mono metricLabel">ACTIVE / 30D</text><text y="29" class="sans metric">${active30}</text></g><g transform="translate(365 34)"><text class="mono metricLabel">FEATURED LANGUAGES</text><text y="29" class="sans metric">${Math.max(1, languages.length)}</text></g><g transform="translate(584 34)"><text class="mono metricLabel">DISCOVERY MODE</text><text y="29" class="sans metric" fill="#70E1C8">AUTO</text></g><text x="1044" y="53" text-anchor="end" class="mono tiny muted">SYNCED FROM GITHUB API</text></g>
${cards}
<text x="78" y="652" class="mono tiny muted">GLASGOW, SCOTLAND</text><text x="1122" y="652" text-anchor="end" class="mono tiny muted">github.com/${USER}</text></svg>`;
}

function readmeProjectList(featured) {
  return featured.map((repo) => {
    const desc = clampText(repo.description || 'Active public repository.', 110);
    const meta = [repo.language, repo.release?.tag_name].filter(Boolean).join(' · ');
    return `**[${repo.name}](${repo.html_url})**  \n${desc}${meta ? `  \n\`${meta}\`` : ''}`;
  }).join('\n\n');
}

async function updateReadme(featured, snapshotKey) {
  const original = await readFile(README, 'utf8');
  let next = original.replace(/profile\.svg\?v=[a-f0-9]+/, `profile.svg?v=${snapshotKey}`);
  const start = '<!-- PROFILE:PROJECTS:START -->';
  const end = '<!-- PROFILE:PROJECTS:END -->';
  const startIndex = next.indexOf(start);
  const endIndex = next.indexOf(end);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    next = `${next.slice(0, startIndex + start.length)}\n\n${readmeProjectList(featured)}\n\n${next.slice(endIndex)}`;
  }
  if (next !== original) await writeFile(README, next);
}

async function main() {
  const repos = await loadRepos();
  const featured = await enrichFeatured(repos);
  const snapshot = JSON.stringify({
    repos: repos.map((r) => [r.id, r.name, r.pushed_at, r.stargazers_count, r.size, r.description]),
    featured: featured.map((r) => [r.id, r.name, r.pushed_at, r.release?.tag_name || null]),
  });
  const snapshotKey = createHash('sha256').update(snapshot).digest('hex').slice(0, 10);
  await writeFile(OUTPUT, buildSvg({ repos, featured }));
  await updateReadme(featured, snapshotKey);
  console.log(`Profile generated from ${repos.length} repositories; featured: ${featured.map((r) => r.name).join(', ')}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
