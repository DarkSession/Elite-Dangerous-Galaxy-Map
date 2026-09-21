# A record with details

A dump carries none of these four fields, so the host adds them.

<!-- sample: a-record-with-details -->

The HUD draws `description` as a small Markdown subset, with its own parser: it builds
DOM nodes one at a time and sets no `innerHTML`, so raw HTML in your text draws as text.

`icons` stack over the marker, and a string names one of the built-in symbols. The
library fetches no picture and no vector. The browser loads the URL you give when the HUD
draws the thumbnail or the renderer draws the icon. **An icon vector on a second origin
needs an `Access-Control-Allow-Origin` header**, because the renderer reads it into a
texture; [The system icons](The-system-icons) states the rule.

## The reference

[SystemRecordInput](SystemRecordInput) is the record and [SystemImage](SystemImage) is
one entry of `images`. The HUD turns the record into [SystemDetails](SystemDetails),
whose `values` are [SystemDetailValue](SystemDetailValue) and whose footer buttons are
[HudAction](HudAction).
