## Purpose

Draws the far view of the galaxy from scene data with hardware-accelerated WebGL2, with
the look of the game's galaxy map, exact positions at every distance, and a frame budget.

## ADDED Requirements

### Requirement: Hardware rendering is asserted
At startup the renderer SHALL read the unmasked renderer string through
`WEBGL_debug_renderer_info`, or `RENDERER` when that extension is absent, and expose it
on the page. If the string contains `SwiftShader`, `llvmpipe` or `Software`, the page
SHALL show an error message that names the renderer and SHALL NOT start the render
loop. The browser test suite SHALL fail when the exposed string is missing, empty, or
names a software renderer.

#### Scenario: Software renderer detected
- **WHEN** the page starts and the renderer string contains `SwiftShader`
- **THEN** the page shows an error that contains `SwiftShader` and no frame is drawn

#### Scenario: Suite asserts the renderer
- **WHEN** the browser test suite runs
- **THEN** its first test reads the exposed renderer string and fails if it is missing,
  empty, or names a software renderer

#### Scenario: No GPU means no string
- **WHEN** the suite runs with Chromium started with `--disable-gpu`
- **THEN** the first test fails because the exposed string is missing

### Requirement: WebGL2 is required
If the browser gives no WebGL2 context, the page SHALL show a message that says WebGL2
is required and SHALL NOT throw.

#### Scenario: No WebGL2
- **WHEN** the page starts in a browser that returns null for a `webgl2` context
- **THEN** the page shows the message and the console has no uncaught error

### Requirement: Two passes compose the far view
Each frame SHALL draw the density volume by raymarching, then the point cloud as additive
point sprites over it. Brightness SHALL map density on a logarithmic scale so that the
galactic centre and the disc at Sol are both visible in the same frame.

#### Scenario: Both structures visible at the default view
- **WHEN** the browser test renders the default view and samples the frame
- **THEN** the pixel at the galactic centre has luminance above 0.8, the pixel at Sol has
  luminance above 0.05, and the pixel at (-45,000, 0, 0), which is outside the disc
  and inside the default view, has luminance below 0.02

#### Scenario: Look matches the baseline
- **WHEN** the browser test renders the default view at 1280x720
- **THEN** the frame matches the committed baseline image with at most 2 percent of
  pixels differing

### Requirement: Rendering is camera-relative
The renderer SHALL subtract the camera position from world positions before any
`float32` matrix multiplication, with the subtraction done in `float64` on the CPU per
chunk. For any camera position inside the model bounds and any zoom distance in range,
two points 1/32 light year apart SHALL map to clip positions that differ by the same
amount as the exact transform, within 1e-3 of that amount.

#### Scenario: Precision at the far corner
- **WHEN** a unit test places the cursor at (50,000, 0, 75,000), sets the distance to
  2,000 light years, and pushes two points 1/32 light year apart through a `float32`
  emulation of the vertex transform
- **THEN** the separation in clip space is within 1e-3 relative of the `float64` result

### Requirement: Orientation matches the game
The map SHALL show the galaxy with `+y` up and with the galactic centre toward the top
of the screen at the default view. `+x` in game coordinates SHALL project to the right
of Sol when the camera looks from Sol toward the centre.

#### Scenario: Centre is up
- **WHEN** a unit test projects Sol and the galactic centre with the default view
- **THEN** the centre's screen `y` is above Sol's screen `y`

#### Scenario: Plus x is right
- **WHEN** a unit test projects Sol and (10,000, 0, 0) with the default view
- **THEN** the second point's screen `x` is greater than Sol's

### Requirement: Frame budget
At 1920x1080 on the dev container's GPU, the mean render time over 300 consecutive
frames SHALL stay under 16.7 ms at zoom distances of 2,000, 20,000 and 120,000 light
years from the cursor, with the cursor at Sol and at the galactic centre. Render time
is measured from the first draw call of a frame to the return of `gl.finish()`, so it
includes GPU work and excludes display refresh waits. The page SHALL expose a
measurement function that renders a given number of frames this way and returns their
mean; the normal render loop SHALL NOT call `gl.finish()`.

#### Scenario: Six views under budget
- **WHEN** the browser test sets each of the six views and calls the measurement
  function for 300 frames
- **THEN** each returned mean is under 16.7 ms

### Requirement: Canvas follows the window
The canvas SHALL fill the viewport and SHALL resize its drawing buffer to the viewport
size times the device pixel ratio, capped at 2, when the window resizes.

#### Scenario: Resize
- **WHEN** the browser test resizes the viewport to 800x600 at device pixel ratio 2
- **THEN** the drawing buffer is 1600x1200
