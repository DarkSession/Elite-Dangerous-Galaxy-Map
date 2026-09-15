## MODIFIED Requirements

### Requirement: View state in the URL fragment
The page SHALL read the view from the URL fragment at load and SHALL write it back to
the fragment when the view changes, at most once per 500 ms. The fragment format SHALL
be `#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>&g=<grid>` with numbers in light years and
degrees.

**The `g` field** SHALL carry the coordinate grid switch: `g=1` for on and `g=0` for off.
The field SHALL be optional in both directions. A fragment that names no readable `g` SHALL
leave the switch at the page's own default, which `coordinate-grid` holds is off for a map
built with no `grid` option and on for the demo site. The page SHALL write the field only
when it has a switch to write, so a page that does not use the grid still writes the four
view fields alone and no reader of the old format breaks.

The page SHALL write the field when the switch moves, whatever moved it: the HUD's
coordinate grid switch, or a call on the handle. The grid switch is not view state, so the
page SHALL read it from the handle's grid change notification, which `real-systems` states.
The write SHALL share the 500 ms limit the view fields hold, so one scheduled write carries
the view and the switch together.

A fragment that arrives after load, which the page already reads for the view, SHALL move
the switch as well when it names a readable `g`, and SHALL leave the switch alone when it
does not.

#### Scenario: Load from fragment
- **WHEN** the page loads with `#c=-9530,-910,19808&d=8000&p=50&y=120`
- **THEN** the view has that cursor, distance, pitch and yaw

#### Scenario: Write to fragment
- **WHEN** the user zooms to a distance of 30,000 light years
- **THEN** within 1 second the fragment contains `d=30000`

#### Scenario: Load the grid from the fragment
- **WHEN** the browser test opens the demo site with `g=0` in the fragment and reads the
  grid switch, and opens it again with `g=1` and reads the switch
- **THEN** the first reading is off and the second is on

#### Scenario: Write the grid to the fragment
- **WHEN** the browser test opens the demo site, turns the coordinate grid switch off in
  the HUD's options panel and waits 1 second, then turns it on and waits again
- **THEN** the fragment holds `g=0` after the first wait and `g=1` after the second

#### Scenario: A fragment with no grid field leaves the switch
- **WHEN** a unit test reads the grid field of `c=0,0,0&d=8000&p=50&y=0`, of the same
  fragment with `g=x`, and of the same fragment with `g=0`
- **THEN** the first two readings say the fragment names no switch, and the third says off

#### Scenario: A later fragment moves the switch
- **WHEN** the browser test opens the demo site with the grid on, then puts
  `#c=0,0,0&d=8000&p=50&y=0&g=0` in the address bar, and last puts the same fragment with
  no `g` and a different distance
- **THEN** the grid goes off at the first change, and stays off at the second
