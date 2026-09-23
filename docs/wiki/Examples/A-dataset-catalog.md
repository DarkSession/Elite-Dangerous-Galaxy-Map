# A dataset catalog

<!-- sample: a-dataset-catalog -->

`loadDataset(id)` calls the entry's `load()`, empties the system set and the category
table, and adds what comes back through the same calls any host uses. A later call wins.

The library fetches nothing and caches nothing: your `load()` reads the data. The HUD
draws the dataset field where the catalog holds entries.

A click on the field opens the dataset library: a search box over the entry labels, a row
of collection chips and a grid of cards. One click on a card loads that entry. The dialog
stays open while the load runs, draws a spinner on the card, and closes when the load
settles.

An entry may name a `bounds` and a `view`. The load writes the bounds, then opens the
camera where the `view` asks. **A camera inside the bounds of the new set keeps its
place.** A load that is not the start load leaves the view alone when the entry names
`bounds`, those bounds resolve to a restricted space over a set with a system, the `view`
is `fit: 'systems'` and no other field, and the cursor is inside those bounds. A camera
zoomed in on one system keeps its place too. A catalog of one region therefore keeps the
angle and the zoom the reader set up. To frame the set on every load, name a field beside
`fit`, such as the pitch the camera holds, or drop `bounds` from the entry.

`hud.datasetArrows` draws a previous and a next arrow around the field, and an `i / n`
counter after them. Each arrow loads the entry beside the loaded one in **catalog order**,
and it is disabled at the end of the catalog and while a load runs. It is off by default.

## The reference

[DatasetEntry](DatasetEntry) is one entry of `datasets` and
[DatasetContent](DatasetContent) is what its `load()` gives back.
[DatasetLoadResult](DatasetLoadResult) is what `loadDataset` gives back, and
[DatasetInfo](DatasetInfo) and [DatasetView](DatasetView) are what the handle reads back
about the catalog.
