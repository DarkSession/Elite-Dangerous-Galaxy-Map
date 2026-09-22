# The HUD

The HUD is opt-in DOM in one `div.gm-hud`: a top bar, a category browser, the map option
switches and an information panel for the selected system.

<!-- sample: the-hud -->

The HUD loads by dynamic import, so `map.hud` is null until `ready` settles.

`details` runs once for each system the panel opens on, never per frame. The sample above
writes its panel and reads no network. A host that fetches takes `signal` from the same
argument and passes it to the request, because the map aborts `signal` when the selection
moves.
`infoFields` turns a worked-out field off, and `lockedOptions` holds a map option at your
setting and draws no switch for it. `datasetArrows` draws a previous and a next arrow
around the dataset field, which `A dataset catalog` states.

**The panel shows the switches the map can act on.** The **Shapes** switch is there while
the map holds at least one sphere or line, the **System icons** switch while at least one
record names an icon, and the **Nebulae** switch where the map holds a nebula source. The
panel reads all three on its tick, so a switch appears when you add the first shape and
goes when a dataset load clears them. While the panel shows no switch it shows no panel,
and the left column holds the category browser alone.

The HUD reads the map through the public handle alone, so a host that wants its own
chrome leaves `hud` out and builds it from the same members.

## The reference

[HudOptions](HudOptions) is the option object and [HudHandle](HudHandle) is `map.hud`.
[HudInfoFields](HudInfoFields) is `infoFields` and [HudMapOption](HudMapOption) is one
entry of `lockedOptions`. The `details` loader takes a [RealSystem](RealSystem) and gives
back [SystemDetails](SystemDetails), whose parts are
[SystemDetailValue](SystemDetailValue) and [HudAction](HudAction).
