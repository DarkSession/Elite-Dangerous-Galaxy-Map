## ADDED Requirements

### Requirement: The cycles page carries the dataset step arrows

The page SHALL build its HUD with `datasetArrows` true, which `dataset-catalog` defines.
The catalog is one entry per week of the war in cycle order, so "the next cycle" and "the
previous cycle" are the entry beside the loaded one, and the arrows are the control for
that. A reader who steps through the war week by week then needs no dialog: one click on
the next arrow loads the next week.

The counter beside the arrows SHALL read the loaded cycle's place in the catalog and the
count of cycles, so the page states how far through the war the reader is.

#### Scenario: The arrows step the war week by week

- **WHEN** the browser suite opens the cycles page, waits for the first cycle, reads the
  counter, clicks **next dataset**, waits for the load, and reads the records and the
  counter
- **THEN** the counter reads `1 / <cycles>` and then `2 / <cycles>`, and the map holds the
  records of the second cycle alone

#### Scenario: The last cycle is the end of the arrows

- **WHEN** the browser suite loads the last cycle of the page and reads the two arrows
- **THEN** the next arrow is disabled and the previous arrow is not
