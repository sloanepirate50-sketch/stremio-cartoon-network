// Catalog logic shared by the live add-on server (addon.js) and the static export (scripts/export-static.js).

const { items } = require('./data/catalog.json');
const { version } = require('./package.json');

const PAGE_SIZE = 100;

const CATALOGS = [
  { type: 'series', id: 'cartoon-network', name: 'Cartoon Network', group: 'cn' },
  { type: 'movie', id: 'cartoon-network', name: 'Cartoon Network', group: 'cn' },
  { type: 'series', id: 'hanna-barbera', name: 'Hanna-Barbera Classics', group: 'hb' },
  { type: 'movie', id: 'hanna-barbera', name: 'Hanna-Barbera Classics', group: 'hb' },
  { type: 'series', id: 'adult-swim', name: 'Adult Swim', group: 'as' },
  { type: 'movie', id: 'adult-swim', name: 'Adult Swim', group: 'as' },
];

const decade = year => (year ? `${Math.floor(year / 10) * 10}s` : null);

/** The genre dropdown for a catalog: decades first (newest first), then its most common genres. */
function genreOptions(def) {
  const list = itemsFor(def);
  const decades = [...new Set(list.map(m => decade(m.year)).filter(Boolean))].sort().reverse();
  const counts = new Map();
  for (const m of list) for (const g of m.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  const genres = [...counts].filter(([g, n]) => n >= 3 && g !== 'Animation').sort((a, b) => b[1] - a[1]).map(([g]) => g);
  return [...decades, ...genres];
}

function itemsFor(def) {
  return items.filter(m => m.type === def.type && m.groups.includes(def.group));
}

const rating = m => parseFloat(m.imdbRating) || 0;

function matching(def, { genre, search } = {}) {
  let list = itemsFor(def);
  if (genre) list = list.filter(m => decade(m.year) === genre || m.genres.includes(genre));
  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(m => m.name.toLowerCase().includes(q));
  }
  return list;
}

/** How many titles match (all pages). */
const count = (def, filters) => matching(def, filters).length;

/** One page of matching titles, best rated first (then newest). */
function query(def, { skip, ...filters } = {}) {
  const list = [...matching(def, filters)].sort((a, b) => rating(b) - rating(a) || (b.year ?? 0) - (a.year ?? 0));
  const start = Math.max(0, parseInt(skip, 10) || 0);
  return list.slice(start, start + PAGE_SIZE).map(({ groups, year, ...meta }) => meta);
}

/** The add-on manifest. `withSearch` is false for the static export (static files can't search). */
function manifest({ withSearch = true } = {}) {
  return {
    id: 'community.cartoonnetwork.catalog',
    version,
    name: 'Cartoon Network Catalog',
    description: 'Every Cartoon Network series and movie, plus the classic Hanna-Barbera library and Adult Swim, as '
      + 'browsable catalogs with decade and genre filters. Catalog only: playback comes from your other add-ons.',
    resources: ['catalog'],
    types: ['series', 'movie'],
    catalogs: CATALOGS.map(def => ({
      type: def.type,
      id: def.id,
      name: def.name,
      extra: [
        { name: 'genre', options: genreOptions(def), isRequired: false },
        ...(withSearch ? [{ name: 'search', isRequired: false }] : []),
        { name: 'skip', isRequired: false },
      ],
    })),
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}

module.exports = { CATALOGS, PAGE_SIZE, manifest, query, count, genreOptions };
