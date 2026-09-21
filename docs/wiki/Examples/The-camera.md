# The camera

<!-- sample: the-camera -->

`bounds` is how much of the space the user may browse. `unrestricted` is the default,
`auto` is the box that holds every system of the set, and `sphere` is a ball. The bound
clamps the cursor and the far zoom limit together, and it changes nothing the map draws.

`startView` is the camera the map opens at, and the map flies nowhere to reach it. A
field that a `startView` or a `flyTo` target leaves out keeps the value of the current
view, so `flyTo({ distance: 100 })` is a zoom in place. `interaction` is which of the
user's inputs the map acts on: `zoom`, `orbit`, `pan`, `keys` and `select`. A switch that
is off leaves the same move open to your own calls.

## The view in a URL

<!-- sample: the-view-in-a-url -->

`getView`, `setView` and `onViewChange` read and write the view. The three URL calls are
pure, so you need no map to save a view or to load one.

## The reference

[BrowseBounds](BrowseBounds) is `bounds`, [StartView](StartView) is `startView`, and
[InteractionSwitches](InteractionSwitches) is `interaction`. [MapView](MapView) is the
view, [FlyToTarget](FlyToTarget) and [FlyToOptions](FlyToOptions) are what `flyTo` takes,
and [FlightOutcome](FlightOutcome) is what it gives back. [encodeView](encodeView),
[decodeView](decodeView), [decodeGrid](decodeGrid) and
[createFragmentWriter](createFragmentWriter) are the URL calls.
