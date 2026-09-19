# Third-party notices

This map uses data and code from other projects. This file names each source and its
terms. Read it before you redistribute the map or use it for money.

This map is a non-commercial fan project. Some of the terms below are non-commercial,
so a commercial use of this map needs new permission from each holder.

## `@elite-dangerous-almanac/core`

The map depends on [`@elite-dangerous-almanac/core`](https://github.com/DarkSession/Elite-Dangerous-Almanac),
pinned to an exact version. The map reads four leaves of it: `astro/galaxy-grid` and
`astro/mass-code` for the sector and boxel geometry, and `astro/codex-region` and
`astro/codex-region-lookup` for the galactic codex regions.

The package's own code is under the **MIT** licence, copyright 2026 Elite Dangerous
Community. The package's data keeps the terms of its own sources. The package carries
its full notices in `THIRD_PARTY_NOTICES.md` inside the published package.

## EliteDangerousRegionMap

The 42 galactic codex regions, their ids and their lookup geometry come from
[EliteDangerousRegionMap](https://github.com/klightspeed/EliteDangerousRegionMap) by Ben
Peddell (klightspeed), under the **MIT** licence. The almanac package carries the
region tables; this map reads them through it.

The MIT licence text:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Elite Dangerous game data (Frontier Developments)

The galaxy the region data describes is the game's galaxy. That game data is the
property of **Frontier Developments plc**. This map uses it under Frontier's
[media-usage rules](https://forums.frontier.co.uk/threads/elite-dangerous-media-usage-rules.510879/),
which permit non-commercial use only:

> This map was created using assets and imagery from Elite Dangerous, with the
> permission of Frontier Developments plc, for non-commercial purposes. It is not
> endorsed by nor reflects the views or opinions of Frontier Developments and no
> employee of Frontier Developments was involved in the making of it.

## The nebula records and the sprite atlas

`src/scene-data/nebulae.json` holds 358 nebula records: a position, a radius, a tile
index and, for 190 of them, a name. `src/render/nebula-art.webp` holds the sprite art
those records draw, as 34 tiles of 256 by 256 texels.

The nebulae are of the game's galaxy, so the Frontier Developments terms above apply to
both files, and those terms permit non-commercial use only. The atlas is the stronger
case of the two, because it carries art and not a table of numbers.

The maintainer reviews these terms before a release carries either file. This notice
records what the files are; it does not settle whether they may ship.

## The galaxy density model

The density model in `src/galaxy-model/` is this project's own work. It carries no
third-party code and no third-party data file.

## The Guardian site records of the demo page

`demo-data/guardian-ruins.json` holds 3 categories and 212 Guardian systems, with 600
Guardian Ruins sites between them. The demo page loads them as an example host data set;
the library itself ships no data and fetches none. The records come from the
[Canonn Research Group](https://canonn.science/) through
[CanonnED3D-Map](https://github.com/canonn-science/CanonnED3D-Map), which is under the
**MIT** licence. The file is a conversion of that project's `guardian_ruins.json` data
set, which `Source/data/MapData-GR.js` fetches. `scripts/build-demo-systems.mjs` makes the
conversion, and `pnpm build:demo-data` runs it. The conversion keeps each system's name, its
coordinates, its site types and the bodies its sites are on, and drops every other field.

Each record names its thumbnails at `https://ruins.canonn.tech/images/maps/`, one for each
site type the system holds. The browser loads each picture from Canonn, so this repository
holds none of them and the library fetches none itself.

The category names, the colours and the descriptions in that file are this project's
own. Canonn's own map gives each category a random colour on each load.

The MIT licence text, with the copyright line the project's `LICENSE` carries:

```
MIT License

Copyright (c) 2017 Canonn - Science

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The sites are places in the game's galaxy, so the Frontier Developments terms above
also apply to them.

## The Guardian Structures records of the demo page

`demo-data/guardian-structures.json` holds 10 categories and 163 Guardian systems, with
209 Guardian Structures sites between them. The records come from the same Canonn
Research Group project as the ruins above, under the same **MIT** licence, and the file is
a conversion of that project's `guardian_structures.json` data set.
`scripts/build-demo-systems.mjs` makes the conversion. The conversion keeps each system's
name, its coordinates, its site types and the bodies its sites are on, and drops every
other field. The records name no picture, so the browser fetches none for this set.

The category names, the colours and the descriptions in that file are this project's own.

## The Notable Systems records of the demo page

`demo-data/notable-systems.json` holds 4 categories and 16 systems. The records come from
the same Canonn Research Group project, under the same **MIT** licence, and the file is a
conversion of that project's `notable_systems.json` data set.
`scripts/build-demo-systems.mjs` makes the conversion. The conversion keeps each system's
name, its coordinates and its subject, and turns the `html` field of the dump into the
plain-text description the HUD shows. **The description text is Canonn's own writing**,
carried over under the MIT licence above, with the markup removed.

The category names, the colours and the category descriptions in that file are this
project's own.

## The UIA Map records, spheres and lines of the demo page

`demo-data/uia.json` holds 19 categories, 1,116 systems, 54 spheres and 983 lines of 2,214
points. The records come from the Canonn Research Group's
[CanonnED3D-Map](https://github.com/canonn-science/CanonnED3D-Map) project, under the
**MIT** licence above, and the file is a conversion of three files of that project:

| File                                               | What the conversion takes from it                           |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `Source/data/MapData-UIA.js`                       | 16 systems, the category table, the four sphere lists       |
| `Source/data/csvCache/uia_waypoints_1..9.json`     | The waypoints of each anomaly and the route each one traces |
| `Source/data/csvCache/route_UIA_Hyperdictions.csv` | One row for each hyperdiction a commander reported          |

The map builds itself from the last two at run time, so a conversion of the first file
alone writes a set the live map never shows. `scripts/build-demo-systems.mjs` makes the
conversion, and `pnpm build:demo-data` runs it. The conversion keeps each system's name,
its coordinates and its categories, turns the `infos` field of the source into the
plain-text description the HUD shows, and reads the sphere lists, the waypoint routes and
the report pairs. **The description text of the 16 systems is Canonn's own writing**,
carried over under the MIT licence, with the markup removed.

**The set names commanders.** A record that is the end of a hyperdiction carries the name
of the commander who filed that report and the date of it, as the report file carries
them. Those names are already published in the Canonn repository under the MIT licence
above. The committed fixtures of the tests carry invented names and no name of the report
file.

The source is JavaScript. The converter **parses** the `systemsData` literal and runs no
statement of the file, so a later source cannot run code in this repository.

Each sphere names the category of the list it comes from, and each line names the
categories of the route it traces, so the map draws and hides a shape with its category.
A sphere keeps the colour of its own material in `finishMap`, which is the source's
colour. The category descriptions in that file are this project's own.

## The Adamastor Routes records and lines of the demo page

`demo-data/adamastor.json` holds 10 categories, 8 systems and 8 lines of 38 points. The
records come from the same CanonnED3D-Map project, under the same **MIT** licence, and the
file is a conversion of that project's `Source/data/MapData-Adamastor.js` source. The
conversion keeps each system's name, its coordinates and its categories, turns the `infos`
field into a plain-text description, and reads the `routes` list as lines. A line names the
categories of its route and carries no colour of its own, so it draws in the colour of its
category, which is the source's own colour. A route that names a category the source's
table does not hold takes a grey of this project's own. The 10 categories are the 4 the
records name and the 7 the routes name, with one category in both lists.

The routes name their points by system name, and the source holds no position for a name
its own `systems` list does not carry. The converter reads those names from
[EDSM](https://www.edsm.net/), under the terms of that site's public
[API](https://www.edsm.net/en/api-v1). **The lookup runs in the converter, at build time**,
and the answers are committed in the JSON, so the map itself calls EDSM at no point. The
converter drops a name EDSM does not hold, and it reports every drop.

## The Canonn Factions records and spheres of the demo page

The `multifaction` set of the demo page is the one entry that fetches its records when the
user loads it. The library itself still fetches nothing: the fetch is in the demo host's
own `load()`, in `src/app/multifaction.ts`.

**The records come from the Spansh factions dump**, at
`https://downloads.spansh.co.uk/factions.json.gz`, which is 16.9 MB of gzip and 101 MB of
JSON. The same file is the source the Canonn Research Group's `MapData-multifaction.js`
map reads. [Spansh](https://spansh.co.uk/dumps) lists the dump on its public dumps page.
On 2026-09-18 a `curl -sI` of the URL answered `200`, `content-length: 16872832` and
`access-control-allow-origin: *`. The file carries no licence notice of its own, and this
project found no statement of terms on it. This notice records where the data came from,
as the notices of the two ED Assets files below do.

**The entry depends on that CORS header.** Spansh sets it and this project does not, so a
later change of the header stops the entry in the browser. The map then shows the fetch
error of the dataset, and the other five entries are untouched.

This repository **holds no copy of the dump**, and no test fetches it. The browser reads it
at run time, and the browser tests serve a fixture of a few faction lines that this project
wrote. The build script fetches into `data/`, which the repository ignores.

The two factions the entry names, **Canonn** and **Canonn Deep Space Research**, are
players' own in-game groups. The set holds each system's name, its `id64` and its
coordinates, and the state of each faction in it. It holds no commander name.

**The spheres come from Canonn.** `demo-data/multifaction-spheres.json` holds 2 categories
and 48 spheres, converted from the `permitSpheres` literal of
`Source/data/MapData-multifaction.js` of
[CanonnED3D-Map](https://github.com/canonn-science/CanonnED3D-Map), under the **MIT**
licence above. The conversion keeps each sphere's centre, its radius and its name, and
gives it the category of the list it comes from. The colours of the two sphere categories
are the colours of the source's own materials, and the colours of the four record
categories are the first two pairs of the source's own `factionColorPairs`. The category
names and the descriptions in that file are this project's own.

The systems and the factions are of the game's galaxy, so the Frontier Developments terms
above also apply to them.

## The committed extracts of the three CanonnED3D-Map sources

`tests/fixtures/uia-extract.js`, `tests/fixtures/adamastor-extract.js` and
`tests/fixtures/multifaction-extract.js` are extracts of `MapData-UIA.js`,
`MapData-Adamastor.js` and `MapData-multifaction.js`, cut to about 20 records each. They
are the **Canonn Research Group's own JavaScript**, carried under the **MIT** licence
above, and they keep the style of the source: its comments, its quote styles and its
commented-out blocks. The unit tests read them, so the conversion rules are checked with no network and
on a clean checkout. Neither build carries them, and the lint of this project does not
read them.

`tests/fixtures/uia-waypoints.json`, `tests/fixtures/uia-waypoints-placeholder.json` and
`tests/fixtures/uia-hyperdictions.csv` are **this project's own writing**. They keep the
shape of the two files the UIA map fetches, with invented system names and invented
commander names, so the tests hold the conversion rules and carry no record of the Canonn
files.

## The HUD fonts

The HUD bundles two font families. The build carries the `woff2` files from the two
packages, so no host page reaches a font CDN and the browser tests stay offline.

- **Chakra Petch**, from [`@fontsource/chakra-petch`](https://www.npmjs.com/package/@fontsource/chakra-petch).
  Copyright 2018 The Chakra Petch Project Authors, under the **SIL Open Font License,
  Version 1.1**.
- **IBM Plex Mono**, from [`@fontsource/ibm-plex-mono`](https://www.npmjs.com/package/@fontsource/ibm-plex-mono).
  Copyright 2017 IBM Corp, under the **SIL Open Font License, Version 1.1**.

The licence permits use, study, change and redistribution, on these conditions: the
font files keep this notice, a changed font takes another name, and a font is not sold
by itself. Each package carries the full licence text in its own `LICENSE` file. The
full text is also at <https://openfontlicense.org/>.

## The selection pin

`src/app/markers.ts` draws a pin over the selected system. The shape is the system
marker of the game's own galaxy map. The eight points of the path come from
`https://edassets.org/static/img/galaxy-map/Marker-galaxy-map.svg`, which ED Assets
publishes. This project commits no copy of that file: the eight numbers are written
into a path of its own.

ED Assets states no licence on the file. This notice records where the numbers came
from. The shape itself is Frontier Developments' and falls under the same
non-commercial media usage rules as the game data above.

## The loading picture

`public/EDLoader1.svg` is the loader the demo page shows while the map starts. The file
comes from ED Assets, at
`https://edassets.org/static/img/svg/EDLoader1.svg`. This repository **holds a copy** of
it, and the demo site serves that copy from its own address. The page does not fetch the
file from `edassets.org`.

The copy carries one change. The original names its size as `style="height:170px"` on the
root element. An `<img>` element does not read a size from that CSS, so the picture gets
no size of its own and grows with the box that holds it. The copy names the same 170 by
170 size as `width` and `height` attributes, which the browser reads. The drawing is the
same.

ED Assets states no licence on the file, as it states none on the marker the pin is
drawn from. This notice records where the copy came from. The shape is Frontier
Developments' and falls under the same non-commercial media usage rules as the game data
above.

The library ships no copy: the library build leaves `public/` out of the package, and the
loading picture is a URL the host names.

## The HUD mockup

`.design/` holds the mockup the HUD is built from. `.design/support.js` is 69 KB of
runtime that the design tool wrote so the mockup opens in a browser. It carries no
licence header and no copyright line. It is generated output that travels with the
mockup, and the map neither imports it nor ships it.

`.design/uploads/pasted-1789380827969-0.png` is a screenshot of this project's own map,
so it is this project's own work.

## The procedural naming tables

`astro/galaxy-grid` also reaches the almanac's procedural naming tables, which come
from EDTS by Andy Martin under the BSD 3-Clause licence. Those terms need the licence
text in full wherever the tables travel. The build drops the tables from the bundle:
the map reads two constants from that leaf and calls no naming function, so
tree-shaking removes them. A check after `pnpm build` confirms it. If a later build
carries the tables, add the BSD 3-Clause text here.
