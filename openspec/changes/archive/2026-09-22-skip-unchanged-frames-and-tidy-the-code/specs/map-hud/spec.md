## ADDED Requirements

### Requirement: A host value does not take a built-in readout

The information panel updates two of its built-in fields while a system stays selected:
`RANGE` follows the cursor, and `REGION` takes its name when the lookup answers. The panel
SHALL find these two fields by the built-in field it placed, and SHALL NOT find them by
their label text.

A host value from the details loader can carry any label, `RANGE` and `REGION` among them.
The panel places the host values after the built-in fields. It found the live fields by
label, so a host value labelled `RANGE` took the live range, and the built-in field
stopped. A host value SHALL keep the value the host gave it.

#### Scenario: A host value labelled RANGE keeps its value

- **WHEN** a unit test opens the panel with the range field on and a details loader that
  gives a value labelled `RANGE` with the text `host`, selects a system, and moves the
  cursor 100 light years
- **THEN** the host field reads `host`, and the built-in `RANGE` field reads the new
  distance

#### Scenario: A host value labelled REGION keeps its value

- **WHEN** a unit test opens the panel with the region field on and a details loader that
  gives a value labelled `REGION` with the text `host`, selects a system, and lets the
  region lookup answer
- **THEN** the host field reads `host`, and the built-in `REGION` field reads the region
  name
