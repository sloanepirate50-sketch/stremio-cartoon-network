// Live add-on server. Start it with `npm start`, then install it in Stremio from
// http://127.0.0.1:7000/manifest.json (Stremio must be on the same PC while the server runs).

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { CATALOGS, manifest, query } = require('./catalog');

const builder = new addonBuilder(manifest());

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const def = CATALOGS.find(c => c.type === type && c.id === id);
  const metas = def ? query(def, extra) : [];
  // Let Stremio cache catalog pages for a day; the data only changes when you rebuild it.
  return { metas, cacheMaxAge: 24 * 3600, staleRevalidate: 7 * 24 * 3600 };
});

const port = Number(process.env.PORT) || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`Install in Stremio:  http://127.0.0.1:${port}/manifest.json`);
