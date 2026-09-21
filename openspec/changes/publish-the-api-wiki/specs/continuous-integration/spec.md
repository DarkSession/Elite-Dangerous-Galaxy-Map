## MODIFIED Requirements

### Requirement: The demo site publishes to GitHub Pages from main

After the checks pass on a push to `main`, the workflow SHALL publish the demo site build
to the repository's GitHub Pages site. It SHALL publish nothing from a pull request.

The publish SHALL take the output of the demo site build, which is **`apps/demo/dist/`**
and whose base path is `/Galaxy-Map/`, and SHALL upload that directory as
the Pages artifact. It SHALL NOT upload `packages/galaxy-map/dist/`, which is the library.

The workflow SHALL hold the least permissions the publish needs: read on the contents,
write on the pages, and the id token the Pages deployment uses. It SHALL hold one
concurrency group for the publish, so two pushes in a row do not race and the later one
wins.

**The workflow publishes to two places, and each job holds its own permissions.** The Pages
job writes the demo site and the wiki job of `api-wiki` writes the wiki. Neither job holds
the other's write permission, and the workflow itself holds read on the contents and
nothing more. The two jobs hold separate concurrency groups, so a slow Pages deployment
does not hold the wiki back.

The published site SHALL serve the map, the HUD, the three demo data sets and the loading
image, all from the Pages host. The one other origin it SHALL reach is the host of the
demo data's own thumbnails, which a user reaches only by opening the information panel on
a record that names one. `THIRD_PARTY_NOTICES.md` records both.

#### Scenario: A pull request publishes nothing

- **WHEN** a unit test reads the publish job's condition
- **THEN** it runs only on a push to `main`, and it needs the check job

#### Scenario: The publish takes the demo site build

- **WHEN** a unit test reads the publish job
- **THEN** it uploads `apps/demo/dist/` and holds `pages: write` and `id-token: write` and
  no other write permission

#### Scenario: The published page draws

This scenario is read **after the merge**, because no run of the workflow on `main` can
happen before it. It is the one check of this change that the implementation cannot close
by itself.

- **WHEN** a person opens the published address after a run of the workflow on `main`
- **THEN** the map draws, the HUD shows, and the dataset field reads `Guardian Ruins`
