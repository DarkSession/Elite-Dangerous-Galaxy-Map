## MODIFIED Requirements

### Requirement: The shape set holds the frame budget

With **1,024 spheres** and **4,096 lines** whose points come to **65,536**, at
**1920x1080**, with 50,000 systems, the HUD on and the shapes on, the mean interval between
animation frames SHALL be **18 milliseconds or less** over a camera move. That is the bound
`system-selection` and `map-hud` already hold for the same view.

Reading a full shape set on the main thread — 1,024 spheres and 4,096 lines of 65,536
points, with every line point a coordinate — SHALL take under **40 milliseconds**, which is
the bound `dataset-catalog` holds for a dataset switch.

The pass SHALL cost a **fixed** number of draw calls, whatever the shape count, so the set
size changes the vertex work and not the call count. The count is **three**: one for the
spheres, one for the line segments, and one full-screen pass that writes the lines over the
frame. `design.md` states why the lines take the second step.

**The marker pass costs one draw call more**, which writes the range buffer the spheres
read. It is a second `POINTS` draw over the same marker buffer, with a shader that writes
one value and no colour, so it costs at most 50,000 points whatever the shape set holds,
which is the set bound. The map SHALL make that
draw only while the shape set holds a **shape** that draws, so a map with no shape costs
what it costs today.

**A line needs the range buffer as much as a sphere does.** The line step caps its alpha
over a marker body, which the requirement "The shapes have a switch and are not picked"
states, and it has no other way of finding a marker. A map of lines and no spheres
therefore pays the extra marker draw as well: the Adamastor demo set is such a map, with 8
lines and no sphere, and without the buffer each of its routes could take a marker off the
screen.

The range buffer SHALL be one 32-bit float per pixel of the drawing buffer. At 1920x1080
with a device pixel ratio of 1 that is **8.3 MB**. `design.md` states why the value is a
32-bit float and not a 16-bit one.

**The buffer SHALL take its size on the first frame that draws a shape**, and not on the
resize of the canvas. A host that draws no shape SHALL carry no buffer of the drawing
buffer's size: 8.3 MB of texture that nothing reads costs every such host the allocation
and costs it again on every resize. Two things follow. The debug read of the buffer SHALL
answer `null` until that frame, because a read at a canvas coordinate would fall outside
the buffer the map still holds. A context that gives neither float extension SHALL compile
no range shader, because no frame of that context can draw one.

**A full set is the set bound, and the bound moved.** `system-selection` and `map-hud` read
the same 18 ms interval at the same set, so the three SHALL name one number. This budget
does not move with the bound: where the reading fails, the implementation SHALL make the
work cheaper, or the set bound SHALL land lower.

#### Scenario: A full shape set holds the frame rate

- **WHEN** the browser test adds 50,000 systems, 1,024 spheres and 4,096 lines of 65,536
  points at 1920x1080, resets the animation frame interval statistics, pans the camera
  1,000 light years and zooms from 20,000 light years to 2,000 over two seconds, and reads
  the statistics
- **THEN** the mean interval is 18 milliseconds or less

#### Scenario: A full shape set is read inside its budget

- **WHEN** the browser test measures the main thread from the call to `addSpheres` and
  `addLines` with a full set until both return
- **THEN** the measurement is under 40 milliseconds

#### Scenario: The set size does not change the call count

- **WHEN** the browser test reads the draw call count of the shape pass with 1 sphere and
  1 line, and again with 1,024 spheres and 4,096 lines
- **THEN** both readings are 3

#### Scenario: A map with no shape makes no range draw

- **WHEN** the browser test reads the draw call count of the marker pass with 10,000
  systems and no shape, then adds one sphere that draws and reads it again
- **THEN** the first reading is 1 and the second is 2

#### Scenario: A map of lines and no spheres makes the range draw

- **WHEN** the browser test reads the draw call count of the marker pass with 10,000
  systems and one line that draws and no sphere
- **THEN** the reading is 2, so the line step can find a marker body and cap itself
