## MODIFIED Requirements

### Requirement: The record input is typed

The library SHALL export `CategoryInput` and `SystemRecordInput`, and `addCategories` and
`addSystems` SHALL take `readonly CategoryInput[]` and `readonly SystemRecordInput[]`
rather than `readonly unknown[]`.

`CategoryInput` SHALL carry a required `name` string and a required `color` of three
numbers, and optional `description`, `markerStyle` and `maxDrawRange`.
`SystemRecordInput` SHALL carry a required `name` string, a required `coords` with `x`,
`y` and `z` numbers, an **optional** `categories` of strings, and the optional fields the
requirement "A record follows the shape of an EDSM or a Spansh dump" of `real-systems`
lists, each with the type that requirement states. `id64` SHALL accept a number, a string
or a `bigint`. Both types SHALL allow unknown extra fields, because a Spansh or an EDSM
record carries fields the reader drops, and a caller SHALL NOT have to strip them first.

**The two replaced names SHALL be banned at the type level.** `SystemRecordInput` SHALL
declare `primaryCategory?: never` and `secondaryCategories?: never`, and each shape input
SHALL declare the same pair.

Without that pair the ban does not hold. Both types carry an index signature,
`readonly [field: string]: unknown`, which is what allows the extra fields above, and an
index signature turns off TypeScript's excess-property check: a record that names
`primaryCategory` beside `categories` compiles clean, and the reader then drops it with no
word to the caller. A declared `never` is assignable to `unknown`, so the index signature
accepts the declaration, and the named field fails the compile while every unknown field
still passes. The ban is what makes the migration a compile error rather than a silent
loss of every category in the set.

**BREAKING**: `primaryCategory` and `secondaryCategories` are gone from
`SystemRecordInput`, and `categories` replaces them. The field is optional at the type
level, because a set may hold no category at all, which `real-systems` states. **The type
cannot state the rule that binds it**: whether a record may name no category depends on
whether the category table is empty when the call is made, which is a run-time fact the
compiler does not see. The reader holds it and reports it, as it holds every other rule.

`SystemRecordInput` SHALL carry an optional `icons`, an array of at most 4 entries, each
either a string or an object with a `url` string and a `color` of three numbers. The
library SHALL export the icon entry type and the resolved icon type `system-icons` states,
so a host that builds records in TypeScript compiles against the contract and reads what
`getSystem` gives back.

The library SHALL export the shape input types of `map-shapes` under the same rule, and
each SHALL carry an optional `categories` of strings and the same `never` pair, for the
same reason: those types carry the index signature as well.

The run-time reader SHALL NOT change. It still validates every field and still returns the
rejection report, because the data comes from a file or a network call the compiler does
not see. The type states the contract and the reader holds it.

**BREAKING**: a caller that passes an array the type rejects no longer compiles. A caller
that reads JSON into `unknown` casts it at the call, which is the point at which the
unchecked data enters. A caller that names `primaryCategory` or `secondaryCategories` no
longer compiles, because the type declares each of them `never`.

#### Scenario: A well-formed record compiles

- **WHEN** a type test passes an array holding a record with a name, `coords`, a
  `categories` of two strings, an `id64` as a string and two extra fields the reader drops
- **THEN** the compile is clean

#### Scenario: A record with no categories compiles

- **WHEN** a type test passes a record with a name and `coords` and no `categories`
- **THEN** the compile is clean, because an uncategorised set is one the library allows

#### Scenario: A malformed record does not compile

- **WHEN** a type test passes a record whose `categories` is the string `A`, a second whose
  `coords` holds strings rather than numbers, and a third that names `primaryCategory`
  instead of `categories`
- **THEN** all three fail to compile

#### Scenario: The reader still rejects at run time

- **WHEN** a unit test casts an array holding a record with no name to
  `readonly SystemRecordInput[]` and calls `addSystems`
- **THEN** the report holds one rejection with the reason `no-name`, as it does today

#### Scenario: An icon list compiles in both forms

- **WHEN** a type test passes a record whose `icons` is
  `['titan', { url: '/a.svg', color: [1, 2, 3] }]`, and a second whose one entry is an
  object with a `url` and no `color`
- **THEN** the first compile is clean and the second fails

#### Scenario: A shape input compiles with one category list

- **WHEN** a type test passes a sphere with a `position`, a `radius` and a `categories` of
  one string, and a second sphere that names `secondaryCategories`
- **THEN** the first compile is clean and the second fails
