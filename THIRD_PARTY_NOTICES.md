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

## The galaxy density model

The density model in `src/galaxy-model/` is this project's own work. It carries no
third-party code and no third-party data file.

## The procedural naming tables

`astro/galaxy-grid` also reaches the almanac's procedural naming tables, which come
from EDTS by Andy Martin under the BSD 3-Clause licence. Those terms need the licence
text in full wherever the tables travel. The build drops the tables from the bundle:
the map reads two constants from that leaf and calls no naming function, so
tree-shaking removes them. A check after `pnpm build` confirms it. If a later build
carries the tables, add the BSD 3-Clause text here.
