# Systems on the map

Add the categories first, then the records. The reader rejects a record whose category is
missing.

```ts
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);

map.addCategories([
  { name: 'Empire', color: [153, 230, 255], description: 'Imperial space' },
  { name: 'Federation', color: [255, 140, 60], markerStyle: 'disc' },
  { name: 'Landmark', color: [255, 255, 255], maxDrawRange: 5000 },
]);

const report = map.addSystems([
  { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, categories: ['Federation'] },
  {
    name: 'Achenar',
    coords: { x: 67.5, y: -119.46, z: 24.84 },
    categories: ['Empire'],
  },
]);
console.log(report.added, report.replaced, report.rejected.length);

await map.ready;
```

`addSystems` reads the record shape an EDSM or a Spansh dump gives. It keeps the fields
the map needs, drops the rest, and reports each record it rejects with the reason. A
record whose `id64`, or whose name, the set already holds replaces the earlier one.

A category carries a name, an RGB colour and the optional `description`, `markerStyle`
and `maxDrawRange`. The name is the identity: a category added again replaces the first.
`markerStyle` is `glow`, a soft halo, or `disc`, a filled circle with a dark ring.
`maxDrawRange` is how far the cursor may be from a system and still draw its marker, in
light years.

## The reference

[SystemRecordInput](SystemRecordInput) is the record, [CategoryInput](CategoryInput) is
the category, and [AddReport](AddReport) and [CategoryReport](CategoryReport) are what
the two calls give back. [Reject](Reject) and [CategoryReject](CategoryReject) carry the
reason for each record the reader turned down.
