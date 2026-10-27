# Cartoon Network Catalog for Stremio

A Stremio **catalog add-on** that lists every Cartoon Network series and movie, the classic
Hanna-Barbera library and Adult Swim as browsable rows in Stremio's Board and Discover.

| Catalog | What's in it |
|---|---|
| **Cartoon Network** (series, movies) | Everything that premiered on a Cartoon Network channel worldwide or was made by Cartoon Network Studios (incl. the European studio behind Gumball) |
| **Hanna-Barbera Classics** (series, movies) | The Flintstones, The Jetsons, Scooby-Doo, Yogi Bear, … |
| **Adult Swim** (series, movies) | Adult Swim's original programming and Toonami. Shows that also aired on Cartoon Network appear in both. |

Each catalog has a **genre/decade filter** (2020s, 2010s, … Comedy, Action, …), **search**, and is sorted best-rated first.

## Install

In Stremio (desktop, Android, TV, or web): **Add-ons → search box → paste this → Install**

```
https://sloanepirate50-sketch.github.io/stremio-cartoon-network/manifest.json
```

This hosted version is rebuilt and published by GitHub Actions on every push. It has everything except text
search (static hosting can't search); run it locally (below) if you want search too.

**Catalog only.** Posters, descriptions and episode lists come from Cinemeta (Stremio's built-in metadata),
and playback comes from whatever stream add-ons you have installed. This add-on doesn't host or link to any
video itself.

## Use it on this PC

```powershell
npm install        # first time only
npm start          # → Install in Stremio: http://127.0.0.1:7000/manifest.json
```

In Stremio: **Add-ons → search box → paste `http://127.0.0.1:7000/manifest.json` → Install**.
The server has to be running while you browse the catalogs.

## Use it everywhere (phone, TV, other PCs), free, no server

```powershell
npm run export     # writes the add-on as plain files to .\static
```

Upload the `static` folder to any static web host (GitHub Pages, Netlify, Cloudflare Pages) and install
`https://<your-site>/manifest.json` in Stremio on any device. The static version has everything except text search.

## Refresh the data

```powershell
npm run build      # a few minutes; then restart the server or re-export
```

Titles come from Wikidata and Wikipedia (open data): anything whose original network is a Cartoon Network
channel or Adult Swim, anything produced by Cartoon Network Studios or Hanna-Barbera, and the Cartoon Network /
Adult Swim original-programming categories on Wikipedia. Episodes, seasons, characters and games are filtered
out, and only titles Cinemeta knows are kept, so everything opens properly in Stremio. Wikimedia responses are
cached in `data/.cache`; delete it to fetch everything fresh.

## Files

| File | Purpose |
|---|---|
| `addon.js` | The live add-on server (Stremio Add-on SDK) |
| `catalog.js` | Catalog definitions, filtering, sorting, paging and the manifest, shared by server and export |
| `scripts/build-catalog.js` | Builds `data/catalog.json` from Wikidata, Wikipedia and Cinemeta |
| `scripts/export-static.js` | Writes the static, host-anywhere version |
| `data/catalog.json` | The built catalog |
