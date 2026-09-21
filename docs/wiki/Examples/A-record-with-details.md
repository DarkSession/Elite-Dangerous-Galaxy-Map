# A record with details

A dump carries none of these four fields, so the host adds them.

```ts
import type { SystemRecordInput } from '@elite-dangerous-almanac/galaxy-map';

const beacon: SystemRecordInput = {
  name: 'HIP 36823',
  coords: { x: 570.4, y: 17.5, z: -68.6 },
  categories: ['Landmark'],
  primaryStar: 'A3 V',
  description:
    'A **Guardian beacon** points to a ruins site.\n\n' +
    '- Read [the survey](https://example.test/survey)',
  images: [{ url: '/pictures/beacon.jpg', caption: 'The beacon' }],
  icons: ['titan', { url: '/icons/ruins.svg', color: [255, 154, 60] }],
};

map.addSystems([beacon]);
```

The HUD draws `description` as a small Markdown subset, with its own parser: it builds
DOM nodes one at a time and sets no `innerHTML`, so raw HTML in your text draws as text.

`icons` stack over the marker, and a string names one of the built-in symbols. The
library fetches no picture and no vector. The browser loads the URL you give when the HUD
draws the thumbnail or the renderer draws the icon. **An icon vector on a second origin
needs an `Access-Control-Allow-Origin` header**, because the renderer reads it into a
texture; [The system icons](The-system-icons) states the rule.

## The reference

[SystemRecordInput](SystemRecordInput) is the record and [SystemImage](SystemImage) is
one entry of `images`. The HUD turns the record into [SystemDetails](SystemDetails),
whose `values` are [SystemDetailValue](SystemDetailValue) and whose footer buttons are
[HudAction](HudAction).
