// Builds data/catalog.json: the Cartoon Network library (everything that premiered on a Cartoon
// Network channel or was made by Cartoon Network Studios) plus the classic Hanna-Barbera library.
//
// Sources (all open data):
//   1. Wikidata: titles whose original network is a Cartoon Network channel, or whose studio is
//      Cartoon Network Studios / Hanna-Barbera.
//   2. Wikipedia: the "Cartoon Network original programming" and studio categories, which catch
//      shows Wikidata doesn't link to the network.
// Every candidate's Wikidata record supplies its IMDb ID (the ID Stremio uses) and its type, so
// episodes, seasons, characters and games can be dropped, along with Adult Swim's adult
// programming. Finally each title is looked up in Cinemeta, Stremio's metadata service, for its
// poster, rating and genres. Only titles Cinemeta knows are kept, so everything opens in Stremio.
//
//   npm run build        (takes a few minutes; Wikimedia asks for gentle request rates)

const fs = require('fs');
const path = require('path');

const USER_AGENT = 'StremioCartoonNetworkCatalog/1.0 (personal Stremio add-on; built from open data)';
const CINEMETA = 'https://v3-cinemeta.strem.io/meta';
const OUT = path.join(__dirname, '..', 'data', 'catalog.json');

// Every Cartoon Network channel in Wikidata (US, UK, Europe, LatAm, India, Korea, ...).
const US_CN = 'Q708290';
const CN_CHANNELS = [
  US_CN, 'Q220288', 'Q247094', 'Q614244', 'Q614265', 'Q662480', 'Q829742', 'Q839728', 'Q855571',
  'Q855588', 'Q856616', 'Q858771', 'Q858805', 'Q939910', 'Q950718', 'Q1183935', 'Q249520', 'Q28715029',
  'Q15458114', 'Q674768', 'Q840860', 'Q105226113', 'Q106639661', 'Q106726726', 'Q108770855', 'Q130361121',
];
const CN_STUDIOS = ['Q858803' /* Cartoon Network Studios */, 'Q519800' /* Hanna-Barbera Studios Europe, ex CN Studios Europe */];
const HANNA_BARBERA = ['Q736464'];

// Wikipedia categories to walk, and how deep into subcategories.
const CATEGORIES = {
  cn: [
    ['Cartoon Network original programming', 2],
    ['Television series by Cartoon Network Studios', 1],
    ['Cartoon Network Studios animated films', 1],
    ['Cartoon Network television films', 1],
  ],
  hb: [['Television series by Hanna-Barbera', 1], ['Hanna-Barbera animated films', 1]],
  as: [['Adult Swim original programming', 2]],
};
// Subcategories that hold things other than shows/films.
const SKIP_SUBCATEGORY = /characters|episodes|video games|comics|people|music|soundtrack|novels|toys|albums|songs|lists|images|templates|actors|crew|staff|merchandise|attractions|logos/i;
// Adult Swim has its own catalog, so the Cartoon Network walk leaves its subcategories to that one.
const SKIP_FOR_GROUP = { cn: /adult swim|toonami/i };

// Wikidata "instance of" values for things that aren't shows or films.
const NOT_A_TITLE = new Set([
  'Q21191270', 'Q1983062', 'Q3464665', 'Q70990126', 'Q21664088', // episodes, seasons
  'Q7889', 'Q4393107', 'Q865493',                                 // video games, game series
  'Q15773347', 'Q15632617', 'Q95074', 'Q15711870', 'Q3658341',    // fictional characters
  'Q1004', 'Q14406742', 'Q482994', 'Q7366', 'Q134556',            // comics, albums, songs, singles
]);
const FILM = new Set(['Q11424', 'Q202866', 'Q506240', 'Q24862', 'Q29168811', 'Q17517379', 'Q24869']);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, attempts = 6) {
  for (let i = 1; ; i++) {
    let retryAfter = 0;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) {
        retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (i >= attempts) throw new Error(`${url.slice(0, 120)}: ${err.message}`);
      await sleep(Math.max(retryAfter, 5000 * i)); // back off politely, longer each time
    }
  }
}

// Wikimedia APIs: one request at a time, about one per second, as their etiquette asks.
// Responses are cached so re-running the build doesn't repeat requests.
const CACHE_DIR = path.join(__dirname, '..', 'data', '.cache');
let lastWikimediaCall = 0;
async function wikimedia(url) {
  const file = path.join(CACHE_DIR, require('crypto').createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const wait = lastWikimediaCall + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastWikimediaCall = Date.now();
  const json = await fetchJson(url);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

async function sparqlItems(property, sources) {
  const query = `SELECT DISTINCT ?item WHERE { VALUES ?src { ${sources.map(q => 'wd:' + q).join(' ')} } ?item wdt:${property} ?src . }`;
  const json = await wikimedia('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query));
  return json.results.bindings.map(b => b.item.value.split('/').pop());
}

async function categoryMembers(title, type) {
  const out = [];
  let cont = '';
  do {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&format=json&cmlimit=500'
      + `&cmtype=${type}&cmtitle=${encodeURIComponent('Category:' + title)}${cont ? '&cmcontinue=' + encodeURIComponent(cont) : ''}`;
    const json = await wikimedia(url);
    out.push(...(json?.query?.categorymembers ?? []).map(m => m.title));
    cont = json?.continue?.cmcontinue ?? '';
  } while (cont);
  return out;
}

/** Article titles in a category and its subcategories, down to `depth` levels. */
async function walkCategory(title, depth, skip, seen = new Set()) {
  if (seen.has(title)) return [];
  seen.add(title);
  const pages = await categoryMembers(title, 'page');
  if (depth > 0) {
    for (const sub of await categoryMembers(title, 'subcat')) {
      const name = sub.replace(/^Category:/, '');
      if (!SKIP_SUBCATEGORY.test(name) && !(skip && skip.test(name)))
        pages.push(...await walkCategory(name, depth - 1, skip, seen));
    }
  }
  return pages;
}

/**
 * Wikipedia article titles -> Wikidata item IDs. Redirects are deliberately not followed: a
 * categorized redirect is usually a special or segment pointing at some other article (one led
 * from Cartoon Network's categories to the live-action film Batman Begins).
 */
async function articlesToItems(titles) {
  const ids = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50).join('|');
    const json = await wikimedia('https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&format=json&titles='
      + encodeURIComponent(batch));
    for (const page of Object.values(json?.query?.pages ?? {}))
      if (page.pageprops?.wikibase_item) ids.push(page.pageprops.wikibase_item);
  }
  return ids;
}

/** Wikidata claims we care about, for many items. */
async function itemDetails(ids) {
  const details = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const json = await wikimedia('https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims|labels&languages=en&format=json&ids='
      + ids.slice(i, i + 50).join('|'));
    for (const [id, e] of Object.entries(json?.entities ?? {})) {
      const values = p => (e.claims?.[p] ?? []).map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
      const firstDate = [...values('P580'), ...values('P577')].map(v => parseInt(String(v.time).slice(1, 5), 10)).filter(Boolean);
      details.set(id, {
        label: e.labels?.en?.value ?? id,
        imdb: values('P345').find(v => /^tt\d+$/.test(v)),
        instances: values('P31').map(v => v.id),
        networks: values('P449').map(v => v.id),
        year: firstDate.length ? Math.min(...firstDate) : null,
      });
    }
    process.stdout.write(`\r  read ${Math.min(i + 50, ids.length)}/${ids.length} Wikidata records`);
  }
  process.stdout.write('\n');
  return details;
}

const mismatches = [];
const words = s => new Set(s.toLowerCase().replace(/¢/g, 'c').replace(/\$/g, 's') // "Ri¢hie Ri¢h"
  .normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ')
  .filter(w => w.length >= 3 && !['the', 'and', 'show', 'with'].includes(w)));
/** True when two titles share a meaningful word (or are too short to compare). */
function namesAgree(a, b) {
  if (/^Q\d+$/.test(a)) return true; // no English label on Wikidata: nothing to compare
  const wa = words(a), wb = words(b);
  if (wa.size === 0 || wb.size === 0) return true;
  return [...wa].some(w => wb.has(w));
}

/** Looks a title up in Cinemeta, trying the likelier type first. Returns null if it isn't a proper title there. */
async function cinemeta(t) {
  for (const type of t.isFilm ? ['movie', 'series'] : ['series', 'movie']) {
    const json = await fetchJson(`${CINEMETA}/${type}/${t.imdb}.json`);
    const m = json && json.meta;
    if (!m || !m.name) continue;
    // Cinemeta's movie endpoint can answer a series ID with an unrelated film: only accept an exact match.
    if (m.id !== t.imdb && m.imdb_id !== t.imdb) continue;
    // Cinemeta occasionally has the wrong title on an ID (tt0810644, the Adult Swim pilot Korgoth of
    // Barbaria, comes back as Batman Begins), so the names must share a word. Titles listed under a
    // foreign-language name still pass if the release year matches exactly.
    const cinemetaYear = parseInt(String(m.releaseInfo || m.year || '').slice(0, 4), 10);
    const sameYear = t.year && cinemetaYear === t.year;
    const placeholder = /^#?dupe#?$|^episode #/i.test(m.name);
    if (placeholder || (!namesAgree(t.label, m.name) && !sameYear)) {
      mismatches.push(`${t.imdb}: Wikidata "${t.label}" vs Cinemeta "${m.name}"`);
      return null;
    }
    const genres = m.genres || m.genre || [];
    // Cinemeta also answers for single episodes as "movies"; real films have genres.
    if (type === 'movie' && genres.length === 0) continue;
    return {
      id: t.imdb,
      type,
      name: m.name,
      poster: m.poster || `https://images.metahub.space/poster/medium/${t.imdb}/img`,
      background: m.background,
      logo: m.logo,
      description: m.description,
      releaseInfo: m.releaseInfo || m.year,
      year: parseInt(String(m.releaseInfo || m.year || '').slice(0, 4), 10) || null,
      imdbRating: m.imdbRating,
      genres,
    };
  }
  return null;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i]); } catch (err) { console.warn('\n  skipped:', err.message); results[i] = null; }
      if (++done % 25 === 0 || done === items.length) process.stdout.write(`\r  checked ${done}/${items.length} in Cinemeta`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  process.stdout.write('\n');
  return results;
}

async function main() {
  // 1. Candidates from Wikidata and Wikipedia, per group. Wikipedia's categories are the reliable
  //    word on Cartoon Network vs. Adult Swim (Wikidata lists Adult Swim shows as airing on the
  //    Cartoon Network channel, which is technically true), so their groups are kept separately.
  const groupsOf = new Map();    // Wikidata item ID -> Set of groups, from any source
  const categoryOf = new Map();  // Wikidata item ID -> Set of groups, from Wikipedia categories only
  const strongOf = new Map();    // groups from reliable sources (categories, studio credits)
  const addTo = (map, ids, group) => ids.forEach(id => (map.get(id) ?? map.set(id, new Set()).get(id)).add(group));
  const add = (ids, group, strong = true) => { addTo(groupsOf, ids, group); if (strong) addTo(strongOf, ids, group); };

  // Adult Swim's Wikidata item(s), used both as a source and to sort titles into its catalog.
  const adultSwim = new Set();
  const asSearch = await wikimedia('https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Adult%20Swim&language=en&type=item&limit=5&format=json');
  for (const hit of asSearch?.search ?? []) if (/^Adult Swim$/i.test(hit.label)) adultSwim.add(hit.id);

  console.log('Querying Wikidata...');
  // "Aired on a Cartoon Network channel" is the loosest signal: regional channels also aired films
  // and imported shows. It's marked weak, and weak-only titles must be animated (checked below).
  add(await sparqlItems('P449', CN_CHANNELS), 'cn', false);
  add(await sparqlItems('P272', CN_STUDIOS), 'cn');
  add(await sparqlItems('P272', HANNA_BARBERA), 'hb');
  if (adultSwim.size) add(await sparqlItems('P449', [...adultSwim]), 'as', false);
  console.log(`  ${groupsOf.size} candidates`);

  console.log('Walking Wikipedia categories...');
  for (const [group, roots] of Object.entries(CATEGORIES)) {
    for (const [root, depth] of roots) {
      const articles = await walkCategory(root, depth, SKIP_FOR_GROUP[group]);
      const ids = await articlesToItems([...new Set(articles)]);
      add(ids, group);
      addTo(categoryOf, ids, group);
      console.log(`  ${root}: ${articles.length} articles`);
    }
  }
  console.log(`  ${groupsOf.size} candidates in total`);

  // 2. Keep real shows/films with IMDb IDs, sorting Adult Swim programming into its own catalog.
  const details = await itemDetails([...groupsOf.keys()]);
  const titles = new Map(); // imdb -> candidate
  for (const [id, d] of details) {
    if (!d.imdb || d.instances.some(i => NOT_A_TITLE.has(i))) continue;
    const groups = new Set(groupsOf.get(id));
    const fromCategories = categoryOf.get(id) ?? new Set();
    const adultSwimShow = fromCategories.has('as') || d.networks.some(n => adultSwim.has(n));
    if (adultSwimShow) {
      groups.add('as');
      // An Adult Swim show is only also a Cartoon Network show if Wikipedia files it under Cartoon
      // Network's own programming (e.g. Samurai Jack); otherwise it stays out of the kids' catalog.
      if (!fromCategories.has('cn')) groups.delete('cn');
    }
    if (groups.size === 0) continue;
    const strong = strongOf.get(id) ?? new Set();
    const existing = titles.get(d.imdb);
    if (existing) {
      groups.forEach(g => existing.groups.add(g));
      strong.forEach(g => existing.strong.add(g));
    } else {
      titles.set(d.imdb, { imdb: d.imdb, label: d.label, year: d.year, isFilm: d.instances.some(i => FILM.has(i)), groups, strong: new Set(strong) });
    }
  }
  console.log(`  ${titles.size} titles with IMDb IDs`);

  // 3. Validate and enrich through Cinemeta.
  const list = [...titles.values()];
  const metas = await pool(list, 8, cinemeta);
  const catalog = [];
  let looseDropped = 0;
  metas.forEach((meta, i) => {
    if (!meta) return;
    const t = list[i];
    // Groups that only came from the loose "aired on the channel" signal need the title to be animated.
    const animated = meta.genres.includes('Animation');
    const groups = [...t.groups].filter(g => t.strong.has(g) || animated);
    if (groups.length) catalog.push({ ...meta, groups });
    else looseDropped++;
  });
  console.log(`  ${looseDropped} non-animated titles that only had a loose channel link were left out`);
  if (mismatches.length) console.log(`  ${mismatches.length} rejected because Cinemeta's title didn't match:\n    ${mismatches.join('\n    ')}`);
  catalog.sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), items: catalog }, null, 1));

  const count = (type, group) => catalog.filter(m => m.type === type && m.groups.includes(group)).length;
  console.log(`Saved ${catalog.length} titles to data/catalog.json`);
  console.log(`  Cartoon Network: ${count('series', 'cn')} series, ${count('movie', 'cn')} movies`);
  console.log(`  Hanna-Barbera:   ${count('series', 'hb')} series, ${count('movie', 'hb')} movies`);
  console.log(`  Adult Swim:      ${count('series', 'as')} series, ${count('movie', 'as')} movies`);
  console.log(`  (${list.length - catalog.length} weren't proper titles in Cinemeta and were left out)`);
}

main().catch(err => { console.error(err); process.exit(1); });
