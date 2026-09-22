## MODIFIED Requirements

### Requirement: The icon placement is bounded

The placement SHALL hold to these bounds, so neither the draw work nor the texture storage
follows the size of the set:

- A candidate whose projected centre lies outside the viewport SHALL be dropped before any
  other work.
- The **32** stacks nearest the camera SHALL be kept, by the same rule the name labels keep
  their **66**: a sort of the whole candidate list every frame is what that rules out,
  because the list can hold 50,000 entries.
- At most **32** arrows and **128** icons SHALL be drawn in any frame, because a record
  holds at most 4 icons.
- The pass SHALL issue at most **1** draw call in a frame, whatever the stack count. The
  arrows and the icons share one instance stream and one program, which is what the depth
  order above asks for.
- The pass SHALL hold at most **64** distinct icon vectors as textures. A 65th distinct URL
  SHALL NOT draw, and the map SHALL report it once through `console.warn`. 64 covers the
  16 built-in symbols and a host's own set.
- The pass SHALL allocate no buffer a frame before it needs it, and SHALL reuse its buffers
  from frame to frame.
- A set in which **no record holds an icon** SHALL cost no per-frame placement work,
  whatever the state of the switch. The switch defaults on, so without this a host that
  names no icon would begin paying for a sweep of its whole set.
- **The sweep SHALL read the systems that carry an icon and not the whole set.** The set
  SHALL be able to name those systems, so the per-frame cost follows the number of records
  with icons and not the 50,000 the set can hold.
- **The sweep SHALL read the set's tables and SHALL NOT build a record for a candidate.**
  The position, the icon list and the category's limit SHALL come from the flat tables the
  set holds, so a candidate costs no allocation and no lookup by identity. The sweep built
  a record and a category object for each of 50,000 candidates, which was a third of its
  time.

#### Scenario: A set with no icon reads nothing

- **WHEN** a map holds 50,000 systems, no record names an icon, the icon switch is on, the
  name switch is off, and there is no hover and no selection
- **THEN** the pass places no stack and reads none of the set's icon tables, counted over
  a frame

#### Scenario: One icon turns the placement back on

- **WHEN** one record of that same set is given an icon
- **THEN** the pass reads the set's icon tables, and the stack draws

The second scenario is the control for the first. Without it, the first also passes on the
day the pass stops sweeping at all.

There SHALL be **no overlap test** between two stacks, unlike the name labels. Two markers
a few pixels apart hold their own icons, and dropping one of the two stacks on an overlap
would make an icon blink in and out as the camera moves through a cluster. A name label
carries text a reader must be able to read; an icon is a 28 pixel glyph that reads under a
partial cover.

#### Scenario: The stack count is capped at a full set

- **WHEN** the browser test adds 50,000 systems inside the frame, each carrying 4 icons,
  draws a frame and counts the icon and the arrow placements
- **THEN** the icon count is 128 or fewer and the arrow count is 32 or fewer

#### Scenario: The draw calls are capped at a full set

- **WHEN** the browser test reads the icon pass's draw call count in that same frame
- **THEN** the count is 1 or fewer

#### Scenario: The nearest stacks are the ones kept

- **WHEN** the browser test adds 40 systems with icons along the view axis, draws a frame
  and reads which systems carry a stack
- **THEN** the 32 nearest the camera carry one and the 8 furthest carry none

#### Scenario: An off-screen system carries no stack

- **WHEN** the browser test adds one system with icons and orbits until its marker leaves
  the viewport, then draws a frame and counts the icons
- **THEN** the count is 0

#### Scenario: A 65th distinct vector does not draw

- **WHEN** the browser test adds 65 systems, each with one icon naming a distinct host URL,
  waits for the loads to settle, draws a frame and reads the placements and the console
- **THEN** 64 of the systems carry an icon, one carries none, and the console holds one
  warning about the cap

#### Scenario: The full sweep costs under 1.2 ms

- **WHEN** the browser test adds 50,000 systems inside the frame, each carrying 4 icons,
  draws 120 frames and reads the icon sweep time probe
- **THEN** the mean is 1.2 ms or less at 1920x1080
