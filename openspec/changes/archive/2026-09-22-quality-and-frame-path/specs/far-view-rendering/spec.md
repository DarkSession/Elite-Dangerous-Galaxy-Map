## MODIFIED Requirements

### Requirement: A still map draws at an idle rate
No shader reads a clock, so a map nobody touches draws the picture it drew before. The
frame loop SHALL run at the rate of the display for 1200 ms after a change, and it SHALL
then stop. It SHALL draw every frame while it runs. A change SHALL wake the loop, and a
loop that woke SHALL draw the next animation frame. A change is a write of the view, a
resize, a draw asked for from outside the loop, a call of any member of the handle that
changes what the map draws (the record and shape members,
the category and name filters, the visibility switches and the selection), an input on
the canvas that moves the view only when the loop turns (a wheel notch or a key press),
and the arrival of a thing the map fetched after it started: the scene data, the nebulae
and an icon texture. A flight in progress and a pending start SHALL hold the loop awake.
A drag, a glide and a held key hold it awake by the view writes they make each turn.

The name of this requirement is historical: the idle rate is now zero.

The loop drew one frame each 200 ms while nothing changed, because the icon texture
landed without a wake. Every path that changes the picture now wakes the loop, so the
idle draw has nothing left to cover, and a map nobody touches costs no frame.

The 1200 ms holds the label ease. The region label anchors and targets approach their
place by half-life, and a measurement of a 22,000 light year jump has a label move more
than a twentieth of a CSS pixel until 886 ms after the jump. The stopped map therefore
draws no frame in which a label moves where the user can see it.

**A pointer move alone renders no canvas.** A pointer move is not a change: it SHALL
restart a stopped loop for one overlay frame and SHALL NOT move the settle window. The
renderer reads no hover: the hover ring and the hovered name label are overlay elements.
A frame in which nothing but the pointer changed since the last drawn frame SHALL run the
pick and the marker overlay, and SHALL NOT render the canvas. Such a frame SHALL NOT count as a
drawn frame in `frameStats`.

#### Scenario: A still map drops to the idle rate
- **WHEN** the browser test opens the map, waits out the settle window and reads the
  drawn frames and the loop turns over two seconds
- **THEN** the map draws no frame and the loop does not turn

  The scenario keeps its name so the delta drops nothing. The idle rate is now zero.

#### Scenario: A view change wakes the loop
- **WHEN** the browser test writes the view and reads the drawn frames over the next
  300 milliseconds
- **THEN** the map draws more than 10 frames

#### Scenario: No label moves after the settle window
- **WHEN** the browser test jumps the camera 22,000 light years, reads the box of every
  region label 1300 ms later, and reads them again 1200 ms after that
- **THEN** no label moved by a tenth of a CSS pixel

#### Scenario: A switch on the handle wakes the loop
- **WHEN** the browser test waits out the settle window, turns the grid off and reads
  the drawn frames over the next three animation frames
- **THEN** the map drew at least one of them

#### Scenario: A wheel notch wakes the loop
- **WHEN** the browser test waits out the settle window, sends one wheel notch to the
  canvas and reads the drawn frames over the next 300 milliseconds
- **THEN** the map draws more than 10 frames

#### Scenario: A held key holds the loop
- **WHEN** the browser test waits out the settle window, presses `W` and holds it for
  three seconds, and reads the drawn frames
- **THEN** the map draws more than 100 frames

#### Scenario: An icon texture wakes the loop
- **WHEN** the browser test waits out the settle window, adds one system with an icon
  that names a host URL the map has not loaded, waits for the load to settle and reads
  the drawn frames since the texture landed
- **THEN** the map drew at least one of them, and the icon is in the placements

#### Scenario: A pointer move over a still camera renders no canvas
- **WHEN** the browser test waits out the settle window, moves the pointer across the
  canvas for three seconds over a set of 1,000 systems, and reads the drawn frames and
  the hover ring
- **THEN** the drawn frames are 0, and the hover ring sits under the pointer
