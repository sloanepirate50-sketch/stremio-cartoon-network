// Exports the add-on as plain static files in ./static, so it can be hosted for free on any static
// host (GitHub Pages, Netlify, Cloudflare Pages, ...) and used from any device without a server.
// Static files can't do text search, so the static version leaves search out.
//
//   npm run export

const fs = require('fs');
const path = require('path');
const { CATALOGS, PAGE_SIZE, manifest, query, count, genreOptions } = require('../catalog');

const OUT = path.join(__dirname, '..', 'static');
fs.rmSync(OUT, { recursive: true, force: true });

function write(relative, data) {
  const file = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

write('manifest.json', manifest({ withSearch: false }));

let files = 1;
for (const def of CATALOGS) {
  // Stremio requests /catalog/<type>/<id>/<extra>.json, e.g. genre=2000s&skip=100.json
  for (const genre of [undefined, ...genreOptions(def)]) {
    const total = count(def, { genre });
    for (let skip = 0; skip < Math.max(total, 1); skip += PAGE_SIZE) {
      const metas = query(def, { genre, skip });
      const extra = [genre && `genre=${genre}`, skip && `skip=${skip}`].filter(Boolean).join('&');
      write(path.join('catalog', def.type, extra ? `${def.id}/${extra}.json` : `${def.id}.json`), { metas });
      files++;
    }
  }
}
// A front page, so opening the site in a browser shows how to install instead of a 404.
fs.writeFileSync(path.join(OUT, 'index.html'), landingPage());
files++;

console.log(`Wrote ${files} files to ./static. Upload that folder to a static host and install <your-url>/manifest.json in Stremio.`);

function landingPage() {
  const m = manifest({ withSearch: false });
  const rows = CATALOGS.map(def => `<tr><td>${def.name}</td><td>${def.type === 'series' ? 'Series' : 'Movies'}</td><td>${count(def, {})}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${m.name}</title>
<style>
  :root { --bg: #f6f6f8; --card: #fff; --text: #1b1b22; --dim: #5d5d6b; --accent: #7c5cff; --line: #e3e3ea; }
  @media (prefers-color-scheme: dark) { :root { --bg: #15151b; --card: #1f1f28; --text: #ececf1; --dim: #a0a0b0; --line: #33333f; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 system-ui, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
  main { max-width: 640px; margin: 0 auto; padding: 48px 16px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  p { color: var(--dim); margin: 0 0 24px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  .install { display: inline-block; background: var(--accent); color: #fff; text-decoration: none; font-weight: 600;
             padding: 12px 22px; border-radius: 10px; }
  .url { display: flex; gap: 8px; margin-top: 14px; }
  .url input { flex: 1; min-width: 0; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); font: 13px ui-monospace, Consolas, monospace; }
  .url button { padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); cursor: pointer; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px solid var(--line); }
  td:last-child { text-align: right; color: var(--dim); }
  small { color: var(--dim); }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <h1>${m.name}</h1>
  <p>${m.description}</p>
  <div class="card">
    <a class="install" id="install" href="#">Install in Stremio</a>
    <div class="url"><input id="url" readonly><button id="copy">Copy</button></div>
    <small>Or in Stremio: Add-ons → paste this address into the search box → Install.</small>
  </div>
  <div class="card"><table>${rows}</table></div>
  <small>Built from Wikidata and Wikipedia, with metadata from Cinemeta.
  <a href="https://github.com/sloanepirate50-sketch/stremio-cartoon-network">Source on GitHub</a>.</small>
</main>
<script>
  const manifestUrl = new URL('manifest.json', location.href).href;
  document.getElementById('url').value = manifestUrl;
  document.getElementById('install').href = manifestUrl.replace(/^https?:/, 'stremio:');
  document.getElementById('copy').onclick = () => navigator.clipboard.writeText(manifestUrl)
    .then(() => { document.getElementById('copy').textContent = 'Copied'; });
</script>
</body>
</html>
`;
}
