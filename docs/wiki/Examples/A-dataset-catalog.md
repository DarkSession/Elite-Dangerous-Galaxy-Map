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

`hud.datasetArrows` draws a previous and a next arrow around the field, and an `i / n`
counter after them. Each arrow loads the entry beside the loaded one in **catalog order**,
and it is disabled at the end of the catalog and while a load runs. It is off by default.

## The reference

[DatasetEntry](DatasetEntry) is one entry of `datasets` and
[DatasetContent](DatasetContent) is what its `load()` gives back.
[DatasetLoadResult](DatasetLoadResult) is what `loadDataset` gives back, and
[DatasetInfo](DatasetInfo) and [DatasetView](DatasetView) are what the handle reads back
about the catalog.
