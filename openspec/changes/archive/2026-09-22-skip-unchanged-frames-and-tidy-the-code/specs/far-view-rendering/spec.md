## MODIFIED Requirements

### Requirement: A still map draws at an idle rate
No shader reads a clock, so a map nobody touches draws the picture it drew before. The
frame loop SHALL run at the rate of the display for 1200 ms after a change, and it SHALL
then stop. A change SHALL wake the loop, and a loop that woke SHALL draw the next animation
frame. A change is a write of the view, a
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

**A turn renders the canvas only after a change.** The loop SHALL run the overlay work on
every turn while it runs, because the labels ease. It SHALL render the canvas on a turn
only where one of these changed since the last render:

- a change woke the loop;
- the view;
- the size of the drawing buffer;
- the read-back switch of the background pass;
- the version of the system set, of its categories or of the shape set;
- a value that a renderer setter took.

A turn that renders nothing SHALL keep the pixels of the last render, and SHALL still take
a background reading that is ready. Such a turn SHALL NOT count as a drawn frame in
`frameStats`. The context preserves its drawing buffer, so the pixels stay on the screen.

The pending start of `library-package` expires after the map "has drawn 600 frames". That
count SHALL be the turns that ran the frame work, whether or not they rendered. A pending
start holds the loop awake with nothing to render, so a count of renders would never
reach 600.

The settle window after an interaction held about 71 renders of a picture that did not
change. At 50,000 systems with 4 icons each, the review of 2026-09-22 measured the settle
turn at 2.34 ms with the render and at 0.25 ms without it.

**A draw asked for from outside the loop SHALL always render.** A browser test that
writes a look setting in place and then asks for a draw reads the new picture. A read of
the `look` probe on `debug` SHALL count as a change, because a test writes the look
through the object that the probe gives back. The `wake` probe on `debug` SHALL count as a
change as well, so a test that calls it on each frame reads a render on each frame.

**A pointer move alone renders no canvas.** A pointer move is not a change: it SHALL
restart a stopped loop for one overlay frame and SHALL NOT move the settle window. The
renderer reads no hover: the hover ring and the hovered name label are overlay elements.
A frame in which nothing but the pointer changed since the last drawn frame SHALL run the
pick and the marker overlay, and SHALL NOT render the canvas. Such a frame SHALL NOT count as a
drawn frame in `frameStats`.

**The hover pick SHALL run only where its inputs changed.** Its inputs are the view, the
pointer, the system set with its categories and filters, and the canvas size. A turn in
which none of them changed SHALL keep the hover of the turn before.

#### Scenario: A still map drops to the idle rate
- **WHEN** the browser test opens the map, waits out the settle window and reads the
  drawn frames and the loop turns over two seconds
- **THEN** the map draws no frame and the loop does not turn

  The scenario keeps its name so the delta drops nothing. The idle rate is now zero.

#### Scenario: A view change wakes the loop
- **WHEN** the browser test waits out the settle window, writes the view once, and reads
  the loop turns and the drawn frames over the next 300 milliseconds
- **THEN** the loop turns more than 10 times, and the map draws at least 1 and at most 3
  frames

  At the rate of the display 300 ms is 18 turns. Before this change the map drew each of
  them. The read-back switch can change once after a jump, so the bound is 3 and not 1.

#### Scenario: A turn with no change keeps the picture
- **WHEN** the browser test writes a view with the grid off, waits 500 milliseconds, reads
  the sum of the pixels of the frame, then asks for a draw from outside the loop and reads
  the sum again
- **THEN** the two sums are equal

#### Scenario: The wake probe renders on each frame
- **WHEN** the browser test waits out the settle window and calls the `wake` probe on each
  of 20 animation frames, and reads the drawn frames
- **THEN** the map draws at least 18 frames

#### Scenario: A look write through the probe reaches the screen
- **WHEN** the browser test waits out the settle window, sets the look's nebula light gain
  to zero through the `look` probe, waits three animation frames and reads the sum of the
  pixels of a nebula
- **THEN** the sum equals the sum a draw from outside the loop gives for the same look

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

#### Scenario: A still pointer runs no pick
- **WHEN** a unit test asks the kept hover pick three times: twice with the same view
  epoch, pointer, set versions and canvas size, and once with the pointer one pixel away
- **THEN** the pick runs twice, and the second answer is the first one

### Requirement: Canvas follows the window
The canvas SHALL fill the viewport and SHALL resize its drawing buffer to the viewport
size times the device pixel ratio, capped at 2, when the window resizes.

The canvas SHALL also follow its own box. A host can change the size of the canvas box
with no resize of the window, for example when it opens a side panel. The map SHALL treat
a change of the canvas box as a resize, and a stopped loop SHALL wake for it.

A change of the drawing buffer size clears the buffer. The map SHALL NOT paint a frame in
which the buffer was cleared and not drawn again.

#### Scenario: Resize
- **WHEN** the browser test resizes the viewport to 800x600 at device pixel ratio 2
- **THEN** the drawing buffer is 1600x1200

#### Scenario: A host resizes the canvas box
- **WHEN** the browser test waits out the settle window at device pixel ratio 1, sets the
  width of the canvas to 600 CSS pixels with no resize of the window, and waits three
  animation frames
- **THEN** the drawing buffer is 600 pixels wide, and in the first animation frame after
  the change the sum of the canvas pixels is above 0
