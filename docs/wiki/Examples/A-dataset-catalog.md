# A dataset catalog

<!-- sample: a-dataset-catalog -->

`loadDataset(id)` calls the entry's `load()`, empties the system set and the category
table, and adds what comes back through the same calls any host uses. A later call wins.

The library fetches nothing and caches nothing: your `load()` reads the data. The HUD
draws the dataset field and the library dialog where the catalog holds entries.

## The reference

[DatasetEntry](DatasetEntry) is one entry of `datasets` and
[DatasetContent](DatasetContent) is what its `load()` gives back.
[DatasetLoadResult](DatasetLoadResult) is what `loadDataset` gives back, and
[DatasetInfo](DatasetInfo) and [DatasetView](DatasetView) are what the handle reads back
about the catalog.
