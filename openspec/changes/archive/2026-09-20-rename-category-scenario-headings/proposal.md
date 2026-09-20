## Why

The change `merge-categories-and-frame-datasets` replaces `primaryCategory` and
`secondaryCategories` with one `categories` array. It rewrites the body of every scenario
that read the two fields. It cannot rewrite the **headings**.

`openspec validate` refuses a MODIFIED block whose scenario names do not match the current
spec, and it says so plainly:

```
✗ [ERROR] map-hud/spec.md: MODIFIED "The category browser lists the categories and turns
  them off" omits scenario(s) the current spec still has:
  "The counts read the primary category".
```

A MODIFIED block replaces the whole requirement, so every current scenario heading must
appear in it word for word. There is no `RENAMED` form for a scenario; `RENAMED` names a
requirement. So a rename inside a delta is not possible, in that change or in this one.

Seven headings therefore reach `openspec/specs/` naming two fields that no longer exist.
A reader who greps the specs for a field name finds them and cannot tell whether the field
is gone or the heading is stale.

## What Changes

Seven scenario headings are renamed by a **direct edit of `openspec/specs/`**, with no
delta and no archive step. Every body is already correct: this change touches the seven
heading lines and nothing else.

| Spec            | Heading now                                             | Heading after                                        |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `real-systems`  | An unknown secondary category rejects the record        | An unknown category in the list rejects the record     |
| `real-systems`  | The secondary categories are kept in order, without a repeat | The categories are kept in order, without a repeat |
| `real-systems`  | A secondary category keeps a marker on the screen       | A later category keeps a marker on the screen          |
| `real-systems`  | The colour still follows the primary category           | The colour still follows the first category            |
| `map-hud`       | The counts read the primary category                    | The counts read the first category                     |
| `map-hud`       | The counts read the secondary categories as well        | The counts read the later categories as well           |
| `map-shapes`    | A secondary category keeps a shape on the screen        | A later category keeps a shape on the screen           |

**A direct edit is the route, and it is the only one.** OpenSpec holds the specs as the
record of what the system does. A heading is a label on a scenario and not a rule, the
bodies already state the rule correctly, and no behaviour moves. The two routes a delta
allows are both worse: a MODIFIED block cannot rename, and REMOVED plus ADDED of the whole
requirement changes the requirement's identity to relabel one scenario inside it.

**This change waits for `merge-categories-and-frame-datasets` to archive.** Before that,
four of the seven headings are not in `openspec/specs/` yet. Editing them early would put
this change's text and that change's delta out of step, and the archive would then refuse
the delta.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement changes. `.openspec.yaml` declares `skip_specs: true`, which is what
OpenSpec asks of a change that alters no rule.

## Impact

`openspec/specs/real-systems/spec.md`, `openspec/specs/map-hud/spec.md` and
`openspec/specs/map-shapes/spec.md`: seven lines, each beginning `#### Scenario:`.

No code moves. No test moves. The test names in the tree do not follow these headings, so
nothing in `e2e/` or `tests/` changes with them.

**Depends on** `merge-categories-and-frame-datasets`. Do not start this change before that
one is archived.
