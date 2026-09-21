# Systems on the map

Add the categories first, then the records. The reader rejects a record whose category is
missing.

<!-- sample: systems-on-the-map -->

`addSystems` reads the record shape an EDSM or a Spansh dump gives. It keeps the fields
the map needs, drops the rest, and reports each record it rejects with the reason. A
record whose `id64`, or whose name, the set already holds replaces the earlier one.

The set holds [MAX_SYSTEMS](MAX_SYSTEMS) records, which is 50,000. A record over that
bound is rejected with the reason `over-capacity`, so read the number and cut a larger
source before you call `addSystems`. The map allocates no buffer for the bound: it grows
the buffers with the records, so a map of ten records costs ten records.

A category carries a name, an RGB colour and the optional `description`, `markerStyle`
and `maxDrawRange`. The name is the identity: a category added again replaces the first.
`markerStyle` is `glow`, a soft halo, or `disc`, a filled circle with a dark ring.
`maxDrawRange` is how far the cursor may be from a system and still draw its marker, in
light years.

## The reference

[SystemRecordInput](SystemRecordInput) is the record, [CategoryInput](CategoryInput) is
the category, and [AddReport](AddReport) and [CategoryReport](CategoryReport) are what
the two calls give back. [Reject](Reject) and [CategoryReject](CategoryReject) carry the
reason for each record the reader turned down.
