## ADDED Requirements

### Requirement: A load hears when the map no longer wants it

The map SHALL call an entry's `load` with one argument, an `AbortSignal`. A `load` that
takes no argument SHALL keep working, so the addition breaks no host.

The map SHALL abort the signal of a load when a later `loadDataset` starts, and when
`dispose` runs while the load is still in flight. A host's `load` can pass the signal to
its own fetch and stop a download that nobody reads. The `details` loader of
`system-details` already takes a signal for the same reason.

**A load that settles after `dispose` SHALL NOT write the map.** It SHALL NOT clear or add
records, apply bounds or a view, or call a listener. Its promise SHALL reject with the
cancelled error, as the promise of a load that a later load replaced does. The map wrote the
records of a late load into the set of a disposed map before this rule.

**The demo's multifaction load SHALL pass the signal to its fetch.** Its dump is 16.9 MB of
gzip, which a worker inflates to 101 MB of JSON. A second click on another set SHALL abort
the fetch, and SHALL stop the worker that reads the dump. The other entries of the demo
import a committed file, which a signal cannot stop, so they ignore the argument.

#### Scenario: A later load aborts the signal of the first

- **WHEN** a unit test starts a load whose `load` waits on a promise it holds, keeps the
  signal it receives, and starts a second load
- **THEN** the first signal is aborted, and the first promise rejects with the cancelled
  error

#### Scenario: Dispose aborts a load in flight

- **WHEN** a unit test starts a load whose `load` waits on a promise it holds, keeps the
  signal it receives, and disposes the dataset state
- **THEN** the signal is aborted

#### Scenario: A load that settles after dispose writes nothing

- **WHEN** a unit test starts a load, disposes the dataset state, and then lets the
  `load` promise resolve with one category and one system
- **THEN** the write callback is not called, no listener is called, and the promise
  rejects with the cancelled error

#### Scenario: A second click stops the multifaction download

- **WHEN** the browser test holds the answer to the factions dump request, loads the
  multifaction entry, then loads another entry before the answer arrives
- **THEN** the dump request fails as aborted, the second entry is on the map, and the
  page reports no error
