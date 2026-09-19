## MODIFIED Requirements

### Requirement: A record follows the shape of an EDSM or a Spansh dump

A record SHALL carry a `name` that is a string of at least one character, a `coords`
object whose `x`, `y` and `z` are finite numbers, and a `primaryCategory` that is the name
of a category the table holds. The position is in game coordinates in light years.

A record MAY carry `secondaryCategories`, an array of names of categories the table
holds. The array MAY hold any number of names. The reader SHALL drop a name that repeats
and a name equal to the primary category, and SHALL keep the rest in the order the record
gave them. A `secondaryCategories` that is present and is not an array SHALL be dropped,
as an optional field of the wrong type is dropped. An entry of the array that is not the
name of a category the table holds SHALL reject the record, which covers an entry that is
not a string. A secondary category does not change the **colour** or the **style** a
marker draws in, which the primary category alone gives. It does decide whether the marker
draws at all: the requirement "A category can be turned off" states that rule.

The reader SHALL keep these optional fields when they are present and of the stated
type, and SHALL drop every other field of the record:

| Field             | Type                       |
| ----------------- | -------------------------- |
| `id64`            | number, string or `bigint` |
| `allegiance`      | string                     |
| `government`      | string                     |
| `primaryEconomy`  | string                     |
| `security`        | string                     |
| `population`      | finite number              |
| `bodyCount`       | finite number              |
| `description`     | string                     |
| `primaryStar`     | string                     |
| `images`          | array, read as below       |

The reader SHALL store `id64` as a decimal string. A Spansh `id64` is a 64-bit integer,
and `JSON.parse` loses digits above 2^53, so a host that needs every digit passes a
string or a `bigint`.

`description` is text about the system, written in the **Markdown subset** that
`system-details` states. The reader SHALL keep the string as the record gave it: it SHALL
NOT strip a character, SHALL NOT escape one, and SHALL NOT parse the text. The HUD parses
it when it draws it, and it draws no HTML from it, so a description from an untrusted dump
carries no markup into the page.

`primaryStar` is the class of the system's primary star, for example `K5 V`. Neither field
changes how a marker draws. The HUD shows each one, and it hides the description section
when the record carries none and the `details` loader of `system-details` gives none.

`images` is an array of entries, each an object with a `url` string and an optional
`caption` string. The reader SHALL keep at most **8** entries, in the order the record
gave them, and SHALL drop the rest. The reader SHALL drop an entry that is not an object,
an entry whose `url` is not a string, an entry whose `url` is empty, and an entry whose
`url` names a scheme that is not `http` or `https`. A `url` with no scheme is a relative URL and SHALL be kept. A bad entry
SHALL NOT reject the record, because an image is decoration and the rest of the record
still draws and still reads.

The scheme rule is a safety rule, not a formatting one. The HUD puts the `url` in an image
element, so a `javascript:` or a `data:` URL from an untrusted dump would run or embed
content the host did not mean to serve. The library SHALL NOT fetch an image itself: the
browser loads it from the element.

#### Scenario: An EDSM record and a Spansh record are both read

- **WHEN** a unit test adds two categories, then one EDSM record, which carries `id64`,
  `name`, `coords`, `primaryCategory` and `date`, and one Spansh record, which carries
  those fields and `allegiance`, `government`, `primaryEconomy`, `security`,
  `population`, `bodyCount`, `bodies` and `stations`
- **THEN** both are accepted, the kept fields hold the values the records gave, and
  neither `date` nor `bodies` nor `stations` is held

#### Scenario: An unknown secondary category rejects the record

- **WHEN** a unit test adds the category `A`, then two records that name `A` as the
  primary category: one whose `secondaryCategories` hold `B`, which the table does not
  hold, and one whose `secondaryCategories` is the string `A` and not an array
- **THEN** the first is rejected as `unknown-category`, and the second is accepted with
  no secondary category

#### Scenario: The secondary categories are kept in order, without a repeat

- **WHEN** a unit test adds the categories `A`, `B` and `C`, then one record whose
  primary category is `A` and whose `secondaryCategories` are `C`, `B`, `C` and `A`
- **THEN** the record is accepted and holds the secondary categories `C` and `B`, in that
  order

#### Scenario: A large id64 keeps every digit

- **WHEN** a unit test adds a record whose `id64` is the string `2871051900826` and one
  whose `id64` is the bigint `18262930337633`
- **THEN** the reader holds `"2871051900826"` and `"18262930337633"`

#### Scenario: The three HUD fields are kept when they are strings

- **WHEN** a unit test adds one category, then one record that carries `description`,
  `primaryStar` and `images` of one entry, and one record whose `description` is the
  number 4 and whose `primaryStar` is null
- **THEN** both records are accepted, the first holds all three, and the second holds
  neither string

#### Scenario: The image list drops a bad entry and caps at eight

- **WHEN** a unit test adds one record whose `images` hold, in order, an entry with the
  `url` `https://example.test/a.png` and the caption `A`, an entry with the `url`
  `javascript:alert(1)`, an entry with the `url` `/local/b.png`, an entry that is the
  string `c.png`, and then 10 more entries with valid `https` URLs
- **THEN** the record is accepted and holds 8 images: the `https` entry with its caption,
  the relative entry, and the first 6 of the 10, and neither the `javascript` entry nor
  the string entry is held

#### Scenario: An images field that is not an array is dropped

- **WHEN** a unit test adds one record whose `images` is the string `a.png` and one whose
  `images` is an empty array
- **THEN** both records are accepted and neither holds an image

#### Scenario: A description keeps its Markdown characters

- **WHEN** a unit test adds one record whose `description` holds a star, a backtick, a
  bracket and a backslash, and reads the record back from the handle
- **THEN** the string reads exactly as the record gave it, character for character
