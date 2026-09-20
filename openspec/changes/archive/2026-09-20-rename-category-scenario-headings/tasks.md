## 1. Wait for the change this one follows

- [x] 1.1 Verify `merge-categories-and-frame-datasets` is archived, with
      `openspec list` showing it gone from the active changes and
      `openspec/changes/archive/` holding it. Stop here if it is not: four of the seven
      headings are not in `openspec/specs/` before that archive
- [x] 1.2 Verify `openspec validate --specs` is clean on the archived specs, so a later
      failure is known to be this change's

## 2. Rename the seven headings

- [x] 2.1 Rename the four headings of `openspec/specs/real-systems/spec.md`:
      "An unknown secondary category rejects the record" to
      "An unknown category in the list rejects the record";
      "The secondary categories are kept in order, without a repeat" to
      "The categories are kept in order, without a repeat";
      "A secondary category keeps a marker on the screen" to
      "A later category keeps a marker on the screen";
      "The colour still follows the primary category" to
      "The colour still follows the first category"
- [x] 2.2 Rename the two headings of `openspec/specs/map-hud/spec.md`:
      "The counts read the primary category" to "The counts read the first category";
      "The counts read the secondary categories as well" to
      "The counts read the later categories as well"
- [x] 2.3 Rename the one heading of `openspec/specs/map-shapes/spec.md`:
      "A secondary category keeps a shape on the screen" to
      "A later category keeps a shape on the screen"
- [x] 2.4 Verify the edit touched **seven lines and no others**. The archive of
      `merge-categories-and-frame-datasets` rewrote the same three files in the same
      working tree, so `git diff --stat` against `HEAD` holds both edits and cannot show
      the seven alone. The rename script held the bound instead: it asserted each old
      heading was in its file exactly once and each new heading not at all, then replaced
      those seven strings and no other text

## 3. Check

- [x] 3.1 Verify `openspec validate --specs` is clean and that no scenario name repeats
      inside one requirement, which a rename onto an existing name would cause
- [x] 3.2 Verify `grep -rn "primary category\|secondary category" openspec/specs/` names no
      `#### Scenario:` line. The prose that explains the merge may still use the words, and
      the Purpose blocks were corrected by the change this one follows
- [x] 3.3 Verify no active change holds a delta against any of the three specs. A MODIFIED
      block written before this rename would name the old headings and the archive would
      refuse it
