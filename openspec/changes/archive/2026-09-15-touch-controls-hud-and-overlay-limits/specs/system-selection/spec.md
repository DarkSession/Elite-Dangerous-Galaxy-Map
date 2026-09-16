## MODIFIED Requirements

### Requirement: The map holds one hovered system and one selected system

The handle SHALL carry `getHover()`, `getSelection()`, `setSelection(identity)` and
`onSelectionChange(listener)`. `getHover` and `getSelection` SHALL each return a system or
null. `onSelectionChange` SHALL return an unsubscribe, as `onViewChange` does.

**The hover follows the pointer.** The map SHALL remember the last pointer position over
the canvas and SHALL run the pick **once per frame**, not once per pointer event. A
pointer event can arrive at 120 Hz or faster, and one sweep of the set per event would
spend the frame budget on a reading no frame shows. The hover SHALL also be worked out
again when the view changes with the pointer still, because the marker under a still
pointer moves when the camera does. The hover SHALL clear when the pointer leaves the
canvas.

**The selection follows a click.** A left click, which `map-navigation` defines as a press
that stays within 4 CSS pixels and releases within 400 ms, SHALL select the system under
the release pixel. **A tap** SHALL select in the same way. `map-navigation` defines a tap as
a touch that stays within **10 CSS pixels** and releases within 400 ms, and states why the
move limit is wider for a finger than for a mouse. A click that finds no system SHALL leave the selection as it is. The
user orbits with the same button, so a click that lands between markers is far more often
a missed grab than a request to close the panel. The panel's close button and the `Escape`
key clear the selection, and `map-hud` states both.

**`setSelection` takes an identity.** The identity is the `id64` when the record carries
one, and the name when it does not, which is the identity rule of `real-systems`.
`setSelection(null)` SHALL clear the selection. An identity the set does not hold SHALL
clear the selection.

**The selection survives what it can.** A record replaced under the same identity SHALL
keep the selection, and `getSelection` SHALL then return the new record. A selected system
whose category is turned off, or which the name filter drops, SHALL stay selected: its
marker and its pin stop drawing, and the information panel stays open. `clearSystems` and
`clearSystemsAndCategories` SHALL clear the selection.

`onSelectionChange` SHALL fire when the selection becomes a different system, and when it
becomes null from a system or a system from null. It SHALL NOT fire when a call sets the
selection to the system already selected.

#### Scenario: A click selects and the listener hears it

- **WHEN** the browser test adds one system, subscribes to `onSelectionChange`, presses
  the left button at the system's projected centre, releases 100 ms later at the same
  pixel, then reads `getSelection`
- **THEN** the listener fired once with that system and `getSelection` names it

#### Scenario: A drag does not select

- **WHEN** the browser test presses the left button at a system's projected centre, moves
  40 pixels, moves back, and releases 100 ms later
- **THEN** `getSelection` is null and the listener did not fire

#### Scenario: A click on empty space keeps the selection

- **WHEN** the browser test selects a system, then clicks a pixel 200 CSS pixels away from
  every marker
- **THEN** `getSelection` still names the first system

#### Scenario: The hover follows the pointer and clears on leave

- **WHEN** the browser test moves the pointer onto a system's projected centre, waits one
  frame and reads `getHover`, then moves the pointer off the canvas, waits one frame and
  reads again
- **THEN** the first reading names the system and the second is null

#### Scenario: The hover follows a camera move with the pointer still

- **WHEN** the browser test puts the pointer on a pixel that holds no marker, then calls
  `setView` so that a system projects to that pixel, waits one frame and reads `getHover`
- **THEN** the reading names the system

#### Scenario: A replaced record keeps the selection

- **WHEN** a browser test adds a record with the `id64` `1000`, selects it, adds a record
  with the same `id64` and another name, and reads `getSelection`
- **THEN** the reading names the new record and the listener did not fire

#### Scenario: Clearing the set clears the selection

- **WHEN** the browser test selects a system, calls `clearSystems` and reads
  `getSelection`
- **THEN** the reading is null and the listener fired once with null

#### Scenario: An unknown identity clears the selection

- **WHEN** the browser test selects a system, then calls `setSelection('nothing')` and
  reads `getSelection`
- **THEN** the reading is null

#### Scenario: A hidden selected system stays selected

- **WHEN** the browser test selects a system, turns its category off, draws a frame and
  reads `getSelection` and the marker count
- **THEN** the selection still names the system and the marker count does not hold it
