# Spheres and lines

```ts
import type { LineInput, SphereInput } from '@elite-dangerous-almanac/galaxy-map';

const zones: SphereInput[] = [
  { name: 'Permit zone', position: [0, 0, 0], radius: 200, categories: ['Empire'] },
];

const routes: LineInput[] = [
  {
    name: 'Route',
    points: [{ system: 'Sol' }, [500, 0, -200], { system: 'Achenar' }],
    width: 2,
    color: [255, 176, 0],
  },
];

map.addSpheres(zones);
map.addLines(routes);
```

A shape is drawn and is never picked: none hovers, none is selected, and `systemAt` reads
none. A line point is a game coordinate or a system the map resolves when the line is
added. A sphere draws as a shell and washes the markers inside it and behind it.

A shape can name a category of the same table the records use, and it then draws in that
colour. A category holds one visibility flag for each kind, so
`setShapeCategoryVisible(name, false)` hides its shapes and leaves its markers.

## The reference

[SphereInput](SphereInput) and [LineInput](LineInput) are what the two calls take, and
[Sphere](Sphere) and [Line](Line) are what the map holds. [LinePoint](LinePoint) is one
point of a line. Both calls give back a [ShapeReport](ShapeReport), whose rejects are
[ShapeReject](ShapeReject). [ShapeInfo](ShapeInfo) and [ShapeKind](ShapeKind) name a
shape the map already holds.
