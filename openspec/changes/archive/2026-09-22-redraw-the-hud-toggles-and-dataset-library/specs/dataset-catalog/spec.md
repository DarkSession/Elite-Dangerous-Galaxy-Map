## ADDED Requirements

### Requirement: The host turns on the dataset step arrows

`HudOptions` SHALL carry `datasetArrows`, a boolean that is **false** when the options name
none and when it holds a value that is not a boolean. It SHALL be read only where the top
bar built the dataset field, which is where the catalog holds at least one entry.

While it is true the bar SHALL hold, around the dataset field: a **previous dataset** button
before it, a **next dataset** button after it, and a counter after the next button that
reads `<place> / <total>`, where `<place>` is the 1-based place of the loaded entry in the
catalog and `<total>` is the count of entries. An entry the catalog does not hold, which is
what the bar shows before the first load settles, SHALL read `- / <total>`.

Each button SHALL load the entry beside the loaded one in **catalog order**, which is the
order `getDatasets()` gives, by the same call a card click makes. The order does not follow
the dialog's filter or its chips: the arrows step through the catalog and the dialog's
filter is a reading of it.

A button SHALL be **disabled**:

- on the **previous** button, while the loaded entry is the first of the catalog;
- on the **next** button, while the loaded entry is the last of the catalog;
- on both, while a load is running, so a held key starts no queue of loads.

A disabled button SHALL carry `disabled` and SHALL take no focus, because it is a step the
catalog does not hold rather than a rule the user can act on.

**Both buttons SHALL be disabled while the map holds no entry of the catalog.** A map that
holds no entry has no neighbour in either direction, so neither step names a target. The
only way to reach that state is a **start load that rejects**, because the map always
starts a load. The user then loads an entry from the dialog, which the field opens beside
the arrows, and the arrows work from that entry on. The arrows SHALL NOT fall back to the
first entry of the catalog: "next" would then mean "first", which is a second meaning for
one control.

A button the **load** disabled holds the keyboard focus at the moment it is disabled, and
the browser then drops that focus to the body. The bar SHALL remember that button and
SHALL give the focus back to it when it is enabled again, so a keyboard user steps a
second time without a new tab. Where the button is still disabled after the load, because
the new entry is at the end of the catalog, the focus SHALL stay where the load left it.

Each button SHALL carry an `aria-label` that names the entry it loads, for example
`Previous dataset, Guardian Ruins`, and SHALL read `First dataset` or `Last dataset` where
there is none.

With `datasetArrows` false or absent the bar SHALL hold the field alone, with no button and
no counter, and SHALL be the bar it is today.

#### Scenario: The arrows are off by default

- **WHEN** the browser test builds a map with a catalog of three entries and `hud: true`,
  and reads the top bar
- **THEN** the bar holds the dataset field and holds no step button and no counter

#### Scenario: The arrows step through the catalog

- **WHEN** the browser test builds a map with `hud: { datasetArrows: true }` and a catalog
  of three entries, waits for the first load, clicks **next dataset**, waits for the load,
  and reads `getLoadedDataset()`, the field and the counter
- **THEN** the reading is the second entry, the field reads its label and the counter reads
  `2 / 3`

#### Scenario: The counter reads a dash before the first load

- **WHEN** the browser test builds a map with `hud: { datasetArrows: true }` and a catalog
  of three entries whose first `load` settles after 300 ms, and reads the counter before the
  first load settles and again after it
- **THEN** the readings are `- / 3` and `1 / 3`

#### Scenario: The arrows stop at the ends

- **WHEN** the browser test with three entries and the arrows on reads the two buttons at
  the first entry, steps to the last and reads them again
- **THEN** the previous button is disabled and the next is not at the first reading, and
  the next is disabled and the previous is not at the second

#### Scenario: A rejected start load leaves both arrows disabled

- **WHEN** the browser test builds a map whose start entry rejects, with a second entry in
  the catalog and the arrows on, and reads the two buttons and the counter
- **THEN** both buttons are disabled and the counter reads `- / 2`

#### Scenario: A step arrow takes the focus back after the load

- **WHEN** the browser test with the arrows on focuses the next button, presses `Enter` on
  an entry whose `load` settles after 700 ms, reads the focus while the load runs, and
  reads it again after the load settles
- **THEN** the focus is off the button at the first reading and back on the next button at
  the second

#### Scenario: An unreadable option leaves the arrows off

- **WHEN** the browser test builds a map whose `hud.datasetArrows` is the string `yes` and
  reads the top bar
- **THEN** the bar holds no step button

### Requirement: The HUD carries a dataset field and a dataset library

When the catalog holds at least one entry, the HUD's top bar SHALL hold a dataset field.
`map-hud` states where it sits, which is the centre of the bar. It SHALL show the loaded
entry's `label`. The line the top bar shows the region name in SHALL NOT be replaced: the
region under the cursor stays what that line reads, because it answers "where am I
looking".

The field SHALL be a button. A click SHALL open the dataset dialog, and `Escape` SHALL
close it. While the dialog is open, the field SHALL carry `aria-expanded` as `true` and
SHALL take the accent border the mockup draws on it.

The field SHALL end in a **chevron** that points down, drawn as a vector and not as a text
character. While a load runs the chevron SHALL be replaced by a **turning spinner**, so the
field states the load without changing its width.

The dialog SHALL hold:

1. A **search box**. Its text SHALL keep an entry whose `label` holds the text, compared
   without case. It SHALL NOT read the `collection` or the category names: the chips below
   are what filters by collection, and a search box that also matched a collection would
   give two controls one job.
2. A row of **collection chips**: one chip named `ALL` with the count of the catalog, then
   one chip per `collection` the catalog holds, **sorted by name and not by the order of the
   catalog**, each with its name and its count. The catalog's own order is what the arrows
   and the card grid follow; the chips are a list the user reads, and a sorted list is what
   a reader scans. An entry with no `collection` SHALL sit under a chip named
   `OTHER`. A click on a chip SHALL keep the entries of that collection alone; a click on
   the chip that is already picked, and a click on `ALL`, SHALL keep every entry. The row
   SHALL be there only where the catalog holds **two or more** collections, because one chip
   beside `ALL` filters nothing.
3. A **grid of cards**, one per entry the search box and the chip both keep, in the order of
   the catalog. A card SHALL show a colour swatch, its `collection` in upper case, and its
   `label`. A card SHALL be a button.
4. A line in the header that reads `<total> DATASETS` while the search box is empty and no
   chip narrows the list, and `<kept> OF <total>` otherwise.
5. A **close** button.

There SHALL be no grouped list, no detail pane, no **cancel** button and no **load dataset**
button. A click on a **card** SHALL start the load of that entry. One click is the whole
action: the step that stood between the click and the load was a pane the user read, and
the card carries what that pane held.

**The card keeps the fields the detail pane showed.** A card's `title` SHALL hold the
entry's `region`, its `description` and its count, so nothing the pane showed is lost. The
count SHALL read `<n> SYSTEMS`, and `FETCHED ON LOAD` where the entry carries no
`systemCount`, which is the text the pane used and which the requirement "The multifaction
set fetches its records when the user loads it" is the first entry to reach. A field the
entry does not carry SHALL be left out of the `title` and SHALL leave no empty separator.

**The swatch colour comes from the collection's name.** The HUD SHALL work out one colour
per collection from its name, by a rule that gives the same colour for the same name in
every session and on every host. The catalog carries no colour field and this change adds
none. The chip and the card of one collection SHALL carry the same colour.

**A click on the loaded entry's card loads nothing.** It SHALL close the dialog and leave
the map as it is. A second load of the set that is already on the map would clear the
records, fetch them again and reset the view, for no change the user asked for. The old
dialog stated the same rule through a **load dataset** button that read `CURRENTLY LOADED`
and did nothing.

**The dialog stays open while the load runs.** A click on a card SHALL put a turning spinner
on that card and SHALL leave the dialog open, so the user sees which entry is loading. The
dialog SHALL close when the load settles, whether it resolved or rejected, and SHALL write
a warning to the console on a rejection. A second click, on that card or another, SHALL
start no second load while one is running. `Escape` and a click on the ground outside the
frame SHALL close the dialog while a load runs, and the load SHALL continue. A load SHALL
close only the dialog it was started from: where the user closes the dialog during a load
and opens it again, the settling load SHALL leave the new dialog open.

**The list is bounded by the catalog.** The catalog reader keeps at most 256 entries, which
this capability already states, so the grid holds at most 256 cards and needs no cap of its
own. The 120-row cap and the line that said the list was cut are gone with the grouped list.

While a load runs, the dataset field SHALL show that it is loading.

The dialog SHALL NOT call `load()` to fill the grid or the chips. It shows what the catalog
entry carries, so opening the dialog fetches nothing.

Every control of the dialog SHALL be a button or an input in the tab order, and the dialog
SHALL hold the focus while it is open, by the rule `map-hud` already states for the
lightbox.

#### Scenario: A card click loads the dataset

- **WHEN** the browser test with two entries clicks the dataset field, clicks the card of
  the second entry, waits for the load, and reads the dialog, the field and
  `getLoadedDataset()`
- **THEN** the dialog is closed, the field reads the second entry's label, and the reading
  is the second entry

#### Scenario: The open field carries the accent border

- **WHEN** the browser test reads the dataset field's `aria-expanded` and its border
  colour, opens the dialog and reads both again, and closes the dialog and reads both a
  third time
- **THEN** the first and the third reading are `false` with the dim border, and the second
  is `true` with the accent colour

#### Scenario: Closing the dialog loads nothing

- **WHEN** the browser test opens the dialog, clicks **close**, and reads
  `getLoadedDataset()`
- **THEN** the reading is the entry that was loaded before

#### Scenario: The search box narrows the grid

- **WHEN** the browser test builds a map with entries labelled `Guardian Ruins`,
  `Guardian Structures` and `Notable Systems`, opens the dialog and types `notable`
- **THEN** the grid holds one card and the header line reads `1 OF 3`

#### Scenario: The search box reads the label alone

- **WHEN** the browser test builds a map with three entries of the collection
  `Canonn Research Group`, opens the dialog and types `canonn`
- **THEN** the grid holds no card and the dialog says no label matches

#### Scenario: A chip keeps one collection

- **WHEN** the browser test builds a map with 5 entries over 2 collections, opens the
  dialog, reads the chips, clicks the chip of the collection that holds 2 entries and reads
  the grid, then clicks the same chip again and reads it
- **THEN** the chips are `ALL 5` and the two collections with their counts, the grid holds
  2 cards and then 5

#### Scenario: One collection draws no chip row

- **WHEN** the browser test builds a map with 4 entries that all name the same
  `collection`, and one with 4 entries that name none, and opens each dialog
- **THEN** neither dialog holds a chip row

#### Scenario: One collection takes one colour

- **WHEN** the browser test opens the dialog on a catalog of two collections and reads the
  swatch colour of every chip and every card
- **THEN** the cards of one collection read the colour of that collection's chip, and the
  two collections read different colours

#### Scenario: A loading card holds the dialog open

- **WHEN** the browser test builds a map whose second entry's `load` settles after 300 ms,
  opens the dialog, clicks that card, reads the dialog and the card after 100 ms, and reads
  the dialog again after the load settles
- **THEN** the dialog is open with a spinner on that card at the first reading and closed at
  the second

#### Scenario: A dialog opened again during a load stays open

- **WHEN** the browser test opens the dialog, clicks a card whose `load` settles after
  700 ms, presses `Escape`, opens the dialog again, and reads the dialog after the load
  settles
- **THEN** the dialog is open and the map holds the entry that loaded

#### Scenario: A second click starts no second load

- **WHEN** the browser test builds a map whose entries count their `load` calls, opens the
  dialog, clicks two cards within 50 ms, waits for the load and reads the counts
- **THEN** one load ran, for the first card clicked

#### Scenario: The grid holds a catalog of 256

- **WHEN** the browser test builds a map with 256 entries over 3 collections and opens the
  dialog
- **THEN** the grid holds 256 cards, the chip row holds 4 chips, and the header reads
  `256 DATASETS`

#### Scenario: The dialog fetches nothing

- **WHEN** the browser test builds a map with three entries whose `load` counts its calls,
  waits for `ready`, opens the dialog, types in the search box and clicks a chip
- **THEN** `load` was called once in total, for the entry loaded at start

#### Scenario: Escape closes the dialog

- **WHEN** the browser test opens the dialog and presses `Escape`
- **THEN** the dialog is closed and the selection is unchanged

#### Scenario: The loaded card closes the dialog and loads nothing

- **WHEN** the browser test builds a map whose entries count their `load` calls, waits for
  the first load, opens the dialog, clicks the card of the loaded entry, and reads the
  dialog, the counts and `getLoadedDataset()`
- **THEN** the dialog is closed, one load ran in total, and the reading is unchanged

#### Scenario: The chips are sorted by name

- **WHEN** the browser test builds a map whose catalog names the collections `Zeta`, `Alpha`
  and `Mu` in that order, opens the dialog and reads the chip row
- **THEN** the chips read `ALL`, `ALPHA`, `MU`, `ZETA` in that order

#### Scenario: A card names its fields in its title

- **WHEN** the browser test opens the dialog and reads the `title` of the card of an entry
  that carries a `region`, a `description` and a `systemCount` of 1,116, and of the
  `Canonn Factions` entry, which carries no `systemCount`
- **THEN** the first holds the region, the description and `1,116 SYSTEMS`, and the second
  holds `FETCHED ON LOAD`

#### Scenario: The field shows a spinner while a load runs

- **WHEN** the browser test builds a map whose second entry's `load` settles after 300 ms,
  clicks that card, and reads the dataset field after 100 ms and again after the load
  settles
- **THEN** the first reading holds the spinner and the second holds the chevron

## REMOVED Requirements

### Requirement: The HUD carries a dataset field and a dataset dialog

**Reason**: The dialog's grouped list, its detail pane, its **cancel** button and its
**load dataset** button are gone, and with them the scenarios "The field opens the dialog
and the dialog loads", "Cancel loads nothing", "The filter narrows the list", "The list is
grouped and capped" and "An entry with no count says so". The dialog is now a search box,
a chip row and a grid of cards, and one click on a card loads.

**Migration**: Read "The HUD carries a dataset field and a dataset library" above. A host
that drove the old two-step flow from its own code SHALL call `loadDataset(id)` on the
handle, which is unchanged. The field, `Escape`, the focus trap and the rule that the
dialog fetches nothing all carry over.
