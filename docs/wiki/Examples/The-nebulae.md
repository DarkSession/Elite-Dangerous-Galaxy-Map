# The nebulae

The nebulae are an **opt-in**, because they are art and a host pays for it in its own
build. The map draws 358 of them as ray-marched volumes.

<!-- sample: the-nebulae -->

Asking for them adds **2,912,225 bytes** of volume files, transfer tables and the index
to your build. A build that never imports the subpath carries none of it.

The map loads the records and the art after the first frame, so the nebulae hold nothing
back. `hasNebulae()`, `areNebulaeVisible()` and `setNebulaeVisible(on)` drive them.

## The reference

[nebulae](nebulae) is the one value the `./nebulae` subpath exports, and
[NebulaSource](NebulaSource) is its type. A host passes the value it imported: the
members of the source are the map's own, not a host's to write.
[GalaxyMapOptions](GalaxyMapOptions) names the option and [GalaxyMap](GalaxyMap) holds
the three calls.
