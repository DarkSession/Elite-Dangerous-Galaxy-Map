## Why

Firefox spends about twelve times the main-thread work of Chromium on the same camera
move, and two CSS blurs carry 62 per cent of it.

The reading below comes from the dev container, on the built demo site, at 1920x1080, with
10,000 systems, the HUD on, the names on and the grid on. The camera turns and moves in and out at
40 light years, over the view `browser-suite` states, and the frame rate is uncapped, so
the mean interval is the work rather than the display's 16.7 ms. Each
state is the mean of three runs, and the widest spread between the runs of one state is
0.45 ms.

| What the map draws                     | Firefox | Chromium |
| -------------------------------------- | ------- | -------- |
| Both blurs, as the map is today        | 12.1 ms | 1.0 ms   |
| The label blur alone, panels flat      | 8.8 ms  |          |
| The panel blur alone, labels stroked   | 8.1 ms  |          |
| Neither blur                           | 4.6 ms  | 0.8 ms   |

So the blurred label shadow costs **4.2 ms** a frame and the blurred panel backdrop
**3.5 ms**, each read against the frame that carries neither. Firefox rasterises both on
the CPU. Chromium blurs on the GPU and never shows the cost.

Two panels carry the whole 3.5 ms: the category panel and the map options panel. They are
the only blurred elements on the screen while the camera moves.

A second instrument agrees. Summing the CPU time of every browser process, on the demo set
at a 40 light year zoom with 24 labels, Firefox reads 22.0 ms a frame against Chromium's
3.9 ms, and 14.9 ms with the text shadows turned off. That run is a different view, a
different set and a different unit, so its numbers are not parts of the table above; it is
there because it reaches the same finding by another route.

The owner's own Firefox profile agrees. The tab main thread rises from 21 per cent of a
core at about 1,000 light years to 71 per cent zoomed in, and 89 per cent of that sits in
`nsTextFrame::PaintOneShadow` and the Gaussian blur under it. Firefox rasterises both
blurs on the CPU. Chromium hides the same cost because it blurs on the GPU.

Nothing in the repository would have caught this. The browser suite runs Chromium alone,
and the dev container held no second browser to run.

## What Changes

- **The overlay labels take a drawn edge in place of a blurred glow.** A stroke under the
  glyphs replaces `GRID_LABEL_SHADOW` and the marker label shadow: 2.5 CSS pixels on a
  coordinate label and 2 on a marker name label, which draws at a smaller size. It
  recovers nearly the whole 4.2 ms: a tighter blur of 3 pixels recovers about a third of
  it and stays a glow, which the owner weighed and turned down. The labels keep a dark
  edge against the star field; the edge is hard rather than soft.
- **The HUD panels become solid translucent and drop the blur.** The two panels beside
  the map draw at 0.86 opacity, so the backdrop contributes 14 per cent of what the reader
  sees. Their opacity goes up to hold the text contrast, and the information
  panel's goes up with them, from 0.90. `backdrop-filter` goes from all five rules, including the dialog and the lightbox, which re-blur in every frame for
  as long as they are open. The dialog's scrim, its frame and the lightbox keep the
  opacity they have; only the elements beside the map change it.
- **Firefox joins the local browser gate.** The dev container installs it, the Playwright
  configuration gains a Firefox project, and one spec measures the CPU cost of a camera
  move and fails when it goes back up.
- **The information panel shows a position exactly.** `POSITION` rounds to 3 decimal
  places today, so the game position `-9530.9375` reads `-9,530.938`. The game resolves a
  position to 1/32 of a light year, which is 0.03125, and 5 decimal places reproduce every
  such value exactly.

### Non-goals

- **The per-frame CSS box rewrite in `plane-overlay` stays.** A synthetic run shows it
  costs from about 1,600 labels up, where Chromium goes from 505 ms a frame to 116 ms. The
  map draws tens of labels: 10 at the view the budget states and 24 at the closer view of
  the CPU run. At either count the rewrite is not measurable. It is not a
  speed fault and this change does not touch it.
- **One grid label size per level stays parked.** It is a stability item about labels that
  change size, not a cost item.
- **The pipeline still does not run the browser suite.** It has no GPU, which
  `continuous-integration` already states.

## Capabilities

### New Capabilities

- `browser-suite`: what the local browser gate runs. The browsers, the projects, the
  renderer each one must report, and the CPU budget a camera move must hold in each.

### Modified Capabilities

- `coordinate-grid`: the coordinate label's dark edge becomes a stroke, not a blurred
  shadow. The requirement that names `0 0 10px` changes, and the scenario that reads the
  shadow changes with it.
- `system-selection`: the marker name label carries the same drawn edge, stated where the
  label is stated.
- `map-hud`: no element carries `backdrop-filter`, and the two panels beside the map and
  the information panel raise their background opacity; `POSITION` shows 5 decimal places. The CPU reading that covers
  the paint is **not** here: the frame budget requirement of `map-hud` is unchanged, and
  the new reading lives in `browser-suite`, because it needs the Firefox project to take
  it.

## Impact

Code:

- `src/app/grid-labels.ts` — `GRID_LABEL_SHADOW` and the style write beside it.
- `src/app/markers.ts` — the name label shadow.
- `src/hud/styles.ts` — five `backdrop-filter` rules and the panel backgrounds under them.
- `src/hud/dom.ts` — `formatCoordinate`, and the unit test that reads it.
- `playwright.config.ts` and `scripts/e2e.mjs` — the Firefox project and the pass it runs
  in.
- `.devcontainer/post-create.sh` and `.devcontainer/README.md` — Firefox, and the cache
  directory it must be able to write.
- `docs/roadmap.md` — the two decisions that change: the browser suite now runs two
  browsers, and the HUD departs from the `.design/` mockup on purpose.
- `README.md` — "Hardware rendering" and the browser suite section name Chromium alone.

Look:

- The label edge changes from a soft glow to a hard stroke. The owner chose it against the
  measured alternatives.
- The HUD panels lose the frosted glass. **The mockup in `.design/` carries
  `backdrop-filter` on six declarations**, so this change departs from the mockup on purpose. The
  screenshot gate that compares the HUD with the mockup reads that difference, and the
  departure is the answer to it.

Scale:

- The overlay holds at most 64 marker name labels plus the hover and the selection label,
  and about 8 coordinate labels. The table above was read at 10 labels and the CPU run at
  24, because the overlap rule drops a label whose box meets one already placed, and 10,000
  markers in one frame therefore do not give 10,000 labels. The budget in `browser-suite`
  is stated at the set, not at the label count: 10,000 systems with the names on, at
  1920x1080, on the project's test card.
