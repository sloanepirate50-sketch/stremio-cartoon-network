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
console.log(`Wrote ${files} files to ./static. Upload that folder to a static host and install <your-url>/manifest.json in Stremio.`);
