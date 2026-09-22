## ADDED Requirements

### Requirement: The handle says whether any record names an icon

The handle SHALL carry `hasSystemIcons()`, which returns true while at least one record on
the map named at least one icon. The HUD reads the map through the public handle alone,
which `map-hud` states, and it needs this reading to decide whether a **System icons**
switch would move anything.

The reading SHALL follow the same rule the icon list follows: it **rises** when a record
that names an icon is added, and it **falls only when the system set is cleared**. A record
that is replaced by one with no icon SHALL leave the reading true. A correction would need a
sweep of the set, and the reading is there to drop a control, not to drive the drawing: a
reading that was true with no icon on the map costs one switch that moves nothing, and a
reading that was false with icons on the map would hide a control the user needs.

The call SHALL cost one read of a count. It SHALL NOT walk the set, because the HUD calls
it 10 times a second and the set holds up to 50,000 records.

The scenarios below are **browser tests**. The reading is a member of the handle, the
handle comes from `createMap`, and `createMap` needs a document and a WebGL context, which
the unit run has neither of. The set's own count has its own unit tests, which
`real-systems` holds; these check the member the HUD calls.

#### Scenario: The reading follows the records

- **WHEN** the browser test builds a map, reads `hasSystemIcons`, adds one system that
  names no icon and reads it again, adds one that names two icons and reads it a third
  time
- **THEN** the readings are false, false and true

#### Scenario: A clear drops the reading

- **WHEN** the browser test adds one system that names an icon, reads `hasSystemIcons`,
  clears the systems and reads it again
- **THEN** the readings are true and false

#### Scenario: A replacement leaves the reading true

- **WHEN** the browser test adds one system that names an icon, adds a record with the
  same name and no icon, and reads `hasSystemIcons`
- **THEN** the reading is true
