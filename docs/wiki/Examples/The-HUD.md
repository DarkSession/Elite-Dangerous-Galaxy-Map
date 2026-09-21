# The HUD

The HUD is opt-in DOM in one `div.gm-hud`: a top bar, a category browser, the map option
switches and an information panel for the selected system.

```ts
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const map = createGalaxyMap(canvas, {
  grid: true,
  systemNames: true,
  loadingImage: '/loader.svg',
  hud: {
    title: 'GALACTIC CARTOGRAPHICS',
    infoFields: { region: false },
    lockedOptions: ['grid'],
    details: async (system, signal) => {
      const answer = await fetch(`/systems/${system.name}`, { signal });
      const held = (await answer.json()) as { about: string; faction: string };
      return {
        description: held.about,
        values: [{ label: 'FACTION', value: held.faction, copy: held.faction }],
        actions: [{ label: 'LOG RECORD', onSelect: (record) => console.log(record) }],
      };
    },
  },
});
```

The HUD loads by dynamic import, so `map.hud` is null until `ready` settles.

`details` runs once for each system the panel opens on, never per frame. The map aborts
`signal` when the selection moves, so a host that fetches passes the signal on.
`infoFields` turns a worked-out field off, and `lockedOptions` holds a map option at your
setting and draws no switch for it.

The HUD reads the map through the public handle alone, so a host that wants its own
chrome leaves `hud` out and builds it from the same members.

## The reference

[HudOptions](HudOptions) is the option object and [HudHandle](HudHandle) is `map.hud`.
[HudInfoFields](HudInfoFields) is `infoFields` and [HudMapOption](HudMapOption) is one
entry of `lockedOptions`. The `details` loader takes a [RealSystem](RealSystem) and gives
back [SystemDetails](SystemDetails), whose parts are
[SystemDetailValue](SystemDetailValue) and [HudAction](HudAction).
