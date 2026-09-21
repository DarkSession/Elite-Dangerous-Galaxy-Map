## ADDED Requirements

### Requirement: Each page of the demo site carries its own catalog

The demo site now holds several pages, and each page is a host of its own. A page SHALL
give the map the catalog it needs, and one page's catalog SHALL say nothing about
another's.

The requirement "The demo page carries seven data sets" SHALL be read as the catalog of
the **demo page**, which is the page at the base path of the site. Its seven entries, its
`collection` values and its rule that no entry but the war set carries `bounds` or `view`
SHALL hold for that page's catalog alone.

The **cycles page** carries a catalog of its own, which `thargoid-war-cycles-page` states.
Every entry of that catalog carries `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`,
because every entry holds one cycle of the war and every cycle holds the bubble alone.

A **sample page** SHALL give the map no catalog, except `a-dataset-catalog`, which shows
the capability and gives the two small sets it holds itself.

The bounds the library states hold for every one of these catalogs: at most 256 entries in
a catalog, and at most 10,000 systems in the set one entry loads.

#### Scenario: The demo page keeps its seven entries

- **WHEN** a unit test reads the catalog the demo page gives the map
- **THEN** it holds the same seven entries, in the same order, with the same `collection`
  values, and the war set is still the one entry that carries `bounds` and `view`

#### Scenario: A second page carries a second catalog

- **WHEN** the browser suite opens the cycles page and reads the catalog
- **THEN** the catalog holds the cycles and none of the demo page's seven entries

## RENAMED Requirements

- FROM: `### Requirement: The demo site carries seven data sets`
- TO: `### Requirement: The demo page carries seven data sets`
