// The HUD style sheet. It goes in the document head as one element with the id
// `gm-hud-styles`, once per document however many maps the page builds, and every rule
// is under the `.gm-hud` class, so the HUD changes no element of the host page.
//
// No rule carries `backdrop-filter`. An element that carries it draws over the canvas,
// the canvas draws a new frame every frame, and the browser therefore blurs the backdrop
// again in every frame. Firefox does that on the CPU: the two panels beside the map cost
// 3.5 ms a frame, of a frame that cost 12.1 ms. `browser-suite` holds the reading. Five
// rules carried it, and the panels beside the map raise their background alpha in its
// place, so the text keeps its contrast over the bright core. The mockup in `.design/`
// draws the panels with the blur, and this sheet departs from the mockup on purpose.
//
// The two faces are bundled with the build. The HUD fetches no font, no style sheet and
// no icon from a third-party host: a library that reached a font CDN would make every
// host page send a request the host did not ask for. Each rule names a fallback stack,
// so a build without the font packages keeps every panel readable.
// `?url&no-inline` and not `?url`: the library build inlines every asset as a data URI
// by default, and the three faces are about 50 KB together. The suffix keeps each one a
// file the browser fetches on first paint. The page build already emits them as files.
import chakraRegular from '@fontsource/chakra-petch/files/chakra-petch-latin-400-normal.woff2?url&no-inline';
import chakraSemiBold from '@fontsource/chakra-petch/files/chakra-petch-latin-600-normal.woff2?url&no-inline';
import monoRegular from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url&no-inline';

/** The id of the one style element the HUD adds to a document. */
export const HUD_STYLE_ID = 'gm-hud-styles';

/** The face the panels read in, and what to use when it does not load. */
const SANS = "'Chakra Petch', 'Helvetica Neue', Arial, sans-serif";

/** The face the readouts read in, and what to use when it does not load. */
const MONO = "'IBM Plex Mono', ui-monospace, 'Courier New', monospace";

/** The accent colour the mockup uses for every heading and every chosen control. */
const ACCENT = '#ff9a3c';

const styleText = `
@font-face {
  font-family: 'Chakra Petch';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${chakraRegular}) format('woff2');
}
@font-face {
  font-family: 'Chakra Petch';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(${chakraSemiBold}) format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${monoRegular}) format('woff2');
}

.gm-hud {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
  color: #f4e6d8;
  font-family: ${SANS};
  font-size: 13px;
  line-height: 1.3;
  -webkit-user-select: none;
  user-select: none;
}
.gm-hud *,
.gm-hud *::before,
.gm-hud *::after {
  box-sizing: border-box;
}
.gm-hud [hidden] {
  display: none !important;
}
.gm-hud :where(button) {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.gm-hud button:focus-visible,
.gm-hud input:focus-visible {
  outline: 1px solid ${ACCENT};
  outline-offset: 1px;
}
.gm-hud ::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.gm-hud ::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
}
.gm-hud ::-webkit-scrollbar-thumb {
  background: rgba(255, 150, 60, 0.35);
}

.gm-hud__top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  pointer-events: auto;
  background: linear-gradient(180deg, rgba(12, 8, 12, 0.92) 0%, rgba(12, 8, 12, 0.35) 100%);
  border-bottom: 1px solid rgba(255, 150, 60, 0.22);
}
.gm-hud__top-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.gm-hud__top-name {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex: 0 0 auto;
  min-width: 0;
}
.gm-hud__top-divider {
  width: 1px;
  height: 26px;
  flex: 0 0 auto;
  background: rgba(255, 150, 60, 0.22);
}
.gm-hud__dataset {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 5px 11px;
  border: 1px solid rgba(255, 150, 60, 0.3);
  background: rgba(0, 0, 0, 0.3);
}
.gm-hud__dataset:hover {
  border-color: rgba(255, 150, 60, 0.75);
}
.gm-hud__dataset[aria-expanded='true'] {
  border-color: #ff9a3c;
}
.gm-hud__dataset-label {
  font-family: ${MONO};
  font-size: 8.5px;
  letter-spacing: 2px;
  color: rgba(244, 230, 216, 0.4);
  white-space: nowrap;
}
.gm-hud__dataset[data-loading='true'] .gm-hud__dataset-label {
  color: ${ACCENT};
}
.gm-hud__dataset-value {
  font-size: 13px;
  letter-spacing: 1px;
  color: #f4e6d8;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gm-hud__dataset-caret {
  font-family: ${MONO};
  font-size: 9px;
  color: ${ACCENT};
  white-space: nowrap;
}
.gm-hud__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 4px;
  color: ${ACCENT};
  white-space: nowrap;
}
.gm-hud__region {
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(244, 230, 216, 0.45);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-hud__top-right {
  display: flex;
  align-items: center;
  gap: 26px;
  font-family: ${MONO};
  font-size: 11px;
  letter-spacing: 1.5px;
  color: rgba(244, 230, 216, 0.6);
}
.gm-hud__zoom {
  white-space: nowrap;
}
.gm-hud__zoom-value {
  color: ${ACCENT};
}
.gm-hud__reset {
  padding: 5px 11px;
  border: 1px solid rgba(255, 150, 60, 0.4);
  color: ${ACCENT};
  white-space: nowrap;
}
.gm-hud__reset:hover {
  background: rgba(255, 150, 60, 0.2);
}

.gm-hud__left {
  position: absolute;
  top: 70px;
  left: 22px;
  bottom: 22px;
  width: 316px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  pointer-events: none;
}
.gm-hud__panel {
  pointer-events: auto;
  background: rgba(14, 10, 14, 0.94);
  border: 1px solid rgba(255, 150, 60, 0.26);
}
.gm-hud__category-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}
.gm-hud__options-panel {
  flex: 0 0 auto;
}
.gm-hud__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border-bottom: 1px solid rgba(255, 150, 60, 0.2);
  background: rgba(255, 150, 60, 0.07);
}
.gm-hud__panel-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 3px;
  color: ${ACCENT};
}
.gm-hud__tabs {
  display: flex;
  gap: 6px;
}
.gm-hud__tab {
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 2px;
  padding: 4px 9px;
  border: 1px solid rgba(255, 150, 60, 0.3);
  color: rgba(244, 230, 216, 0.7);
}
.gm-hud__tab:hover:not(:disabled) {
  background: rgba(255, 150, 60, 0.18);
}
.gm-hud__tab[aria-pressed='true'] {
  border-color: ${ACCENT};
  background: rgba(255, 150, 60, 0.22);
  color: ${ACCENT};
}
.gm-hud__tab:disabled {
  opacity: 0.35;
}
.gm-hud__bulk {
  display: flex;
  gap: 6px;
}
.gm-hud__bulk-button {
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 1px;
  padding: 3px 7px;
  border: 1px solid rgba(255, 150, 60, 0.3);
  color: rgba(244, 230, 216, 0.75);
}
.gm-hud__bulk-button:hover {
  background: rgba(255, 150, 60, 0.18);
}
.gm-hud__search-wrap {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.gm-hud__search {
  width: 100%;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 150, 60, 0.22);
  color: #f4e6d8;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 2px;
  padding: 7px 9px;
  outline: none;
}
.gm-hud__search::placeholder {
  color: rgba(244, 230, 216, 0.35);
}
.gm-hud__category-list {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}
/*
 * The line between two categories sits on the row and not on the group, so the height of
 * the row is the height of one group less the height of its list. That difference is
 * what the panel measures to work the height cap out, and it holds while a list moves.
 */
.gm-hud__category-line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.gm-hud__category-line:hover {
  background: rgba(255, 255, 255, 0.04);
}
/*
 * The dot is a button, so it hovers like the other buttons of the HUD: a wash inside a
 * one pixel border. Without the border the wash is a bare plate behind a 12 pixel
 * diamond, which reads as a fault and not as a control.
 */
.gm-hud__category-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 1px solid transparent;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}
.gm-hud__category-dot:hover {
  background: rgba(255, 150, 60, 0.14);
  border-color: rgba(255, 150, 60, 0.45);
}
.gm-hud__category-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
}
.gm-hud__category-swatch {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  transform: rotate(45deg);
}
.gm-hud__category-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  letter-spacing: 1.5px;
  color: #f4e6d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-hud__category-line[data-on='false'] .gm-hud__category-name {
  color: rgba(244, 230, 216, 0.35);
}
.gm-hud__category-count {
  flex: 0 0 auto;
  font-family: ${MONO};
  font-size: 10px;
  color: rgba(244, 230, 216, 0.4);
}
.gm-hud__category-chevron {
  display: flex;
  flex: 0 0 auto;
  color: rgba(255, 154, 60, 0.55);
}
.gm-hud__category-row[aria-expanded='true'] .gm-hud__category-chevron {
  color: ${ACCENT};
}
/*
 * The list opens and closes over 140 ms on the track of a one-row grid, from 0fr to 1fr.
 * The track resolves to the height of the box inside it, and that box carries the cap
 * and scrolls, so the movement ends at the smaller of the cap and the rows it holds. A
 * transition of \`max-height\` would run to the cap and finish early whenever the rows
 * are shorter.
 */
.gm-hud__system-list {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  transition: grid-template-rows 140ms ease;
}
.gm-hud__system-list[data-open='true'] {
  grid-template-rows: 1fr;
}
/*
 * The cap the panel measures. It is \`max(area - rows, 0.5 * area) / open\`, so the open
 * lists take the height the category rows leave and half the panel where the rows leave
 * less. \`max-height\` takes the smaller of the cap and the rows, so a list of two
 * systems stays two rows high.
 */
.gm-hud__system-rows {
  min-height: 0;
  max-height: var(--gm-list-cap, none);
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.35);
}
.gm-hud__system-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 12px 6px 16px;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(244, 230, 216, 0.78);
  border-left: 2px solid transparent;
}
.gm-hud__system-row:hover {
  background: rgba(255, 150, 60, 0.14);
}
.gm-hud__system-row[aria-current='true'] {
  color: ${ACCENT};
  border-left-color: ${ACCENT};
}
.gm-hud__system-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-hud__system-cut {
  padding: 6px 12px 6px 16px;
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 1px;
  color: rgba(244, 230, 216, 0.45);
}

@media (prefers-reduced-motion: reduce) {
  .gm-hud__system-list {
    transition-duration: 0s;
  }
}

.gm-hud__panel-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.gm-hud__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.gm-hud__toggle-label {
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1.3;
  white-space: nowrap;
  color: rgba(244, 230, 216, 0.8);
}
.gm-hud__track {
  position: relative;
  width: 38px;
  height: 16px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
}
.gm-hud__knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  background: rgba(244, 230, 216, 0.45);
  transition: left 0.15s ease;
}
.gm-hud__toggle[aria-pressed='true'] .gm-hud__track {
  border-color: ${ACCENT};
  background: rgba(255, 150, 60, 0.22);
}
.gm-hud__toggle[aria-pressed='true'] .gm-hud__knob {
  left: 23px;
  background: ${ACCENT};
}

.gm-hud__info {
  position: absolute;
  top: 70px;
  right: 22px;
  width: 380px;
  max-height: calc(100% - 120px);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  z-index: 20;
  background: rgba(14, 10, 14, 0.94);
  border: 1px solid #ff9a3c55;
  box-shadow: 0 0 50px rgba(0, 0, 0, 0.6);
}
.gm-hud__info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 150, 60, 0.22);
  background: rgba(255, 150, 60, 0.07);
}
.gm-hud__info-title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.gm-hud__info-name {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: #ffb055;
  overflow-wrap: anywhere;
}
.gm-hud__info-close {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 150, 60, 0.35);
  color: ${ACCENT};
  font-size: 14px;
}
.gm-hud__info-close:hover {
  background: rgba(255, 150, 60, 0.2);
}
.gm-hud__info-body {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
  padding: 14px;
}
.gm-hud__field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  font-family: ${MONO};
  font-size: 11px;
}
.gm-hud__field {
  border: 1px solid rgba(255, 255, 255, 0.09);
  padding: 8px 9px;
}
/* The position field holds the longest value of the panel, so it takes both columns.
   The region field takes both for the same reading, and so does a field that would
   otherwise leave the other cell of its row empty. The panel works out which fields are
   wide and writes this class, because a field the host turned off moves the rest. */
.gm-hud__field--wide {
  grid-column: 1 / -1;
}
.gm-hud__field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.gm-hud__field-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: rgba(244, 230, 216, 0.45);
}
.gm-hud__copy {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(255, 150, 60, 0.32);
  background: transparent;
  color: rgba(244, 230, 216, 0.6);
}
.gm-hud__copy:hover {
  background: rgba(255, 150, 60, 0.2);
}
.gm-hud__copy[data-state='copied'] {
  border-color: ${ACCENT};
  background: rgba(255, 150, 60, 0.22);
  color: ${ACCENT};
}
.gm-hud__copy .gm-hud__copy-tick {
  display: none;
}
.gm-hud__copy[data-state='copied'] .gm-hud__copy-mark {
  display: none;
}
.gm-hud__copy[data-state='copied'] .gm-hud__copy-tick {
  display: block;
}
.gm-hud__field-value {
  color: #f4e6d8;
  margin-top: 4px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.gm-hud__section-title {
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(244, 230, 216, 0.45);
  margin: 16px 0 8px;
}
.gm-hud__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gm-hud__chip {
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 1.5px;
  padding: 4px 9px;
  border: 1px solid currentColor;
}
.gm-hud__description {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(244, 230, 216, 0.85);
}
/* The nodes the Markdown render builds. It builds a plain element for each mark, so the
   rules read the element and the description takes no class of its own. */
.gm-hud__description p {
  margin: 0 0 8px;
}
.gm-hud__description p:last-child {
  margin-bottom: 0;
}
.gm-hud__description ul,
.gm-hud__description ol {
  margin: 0 0 8px;
  padding: 0;
  list-style-position: inside;
}
.gm-hud__description li {
  padding-left: 14px;
}
.gm-hud__description code {
  font-family: ${MONO};
  font-size: 12px;
  padding: 1px 4px;
  background: rgba(255, 255, 255, 0.08);
}
.gm-hud__description a {
  color: ${ACCENT};
}
/* The line the panel shows while a host's details loader runs. */
.gm-hud__loading {
  font-family: ${MONO};
  font-size: 11px;
  letter-spacing: 1.5px;
  color: rgba(244, 230, 216, 0.45);
}
.gm-hud__thumbs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.gm-hud__thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  cursor: zoom-in;
  border: 1px solid rgba(255, 150, 60, 0.28);
  background-color: #140e12;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 150, 60, 0.14) 0 6px,
    rgba(255, 150, 60, 0) 6px 13px
  );
}
.gm-hud__thumb:hover {
  border-color: rgba(255, 150, 60, 0.7);
}
.gm-hud__thumb-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gm-hud__thumb-caption {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 7px;
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 1px;
  color: rgba(244, 230, 216, 0.75);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.75) 100%);
}
.gm-hud__info-footer {
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 8px;
}
.gm-hud__footer-button {
  flex: 1;
  text-align: center;
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 2px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(244, 230, 216, 0.65);
}
.gm-hud__footer-button:hover {
  background: rgba(255, 255, 255, 0.08);
}
.gm-hud__centre {
  border-color: rgba(255, 150, 60, 0.4);
  color: ${ACCENT};
}
.gm-hud__centre:hover {
  background: rgba(255, 150, 60, 0.2);
}

.gm-hud__dialog {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  z-index: 70;
  background: rgba(4, 3, 6, 0.78);
}
.gm-hud__dialog-frame {
  width: min(92%, 960px);
  max-height: min(82%, 640px);
  display: flex;
  flex-direction: column;
  background: rgba(12, 9, 13, 0.97);
  border: 1px solid rgba(255, 150, 60, 0.45);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.8);
}
.gm-hud__dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 150, 60, 0.24);
  background: rgba(255, 150, 60, 0.07);
}
.gm-hud__dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 3px;
  color: ${ACCENT};
}
.gm-hud__dialog-close {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 150, 60, 0.35);
  color: ${ACCENT};
  font-size: 15px;
}
.gm-hud__dialog-close:hover {
  background: rgba(255, 150, 60, 0.2);
}
.gm-hud__dialog-body {
  display: grid;
  grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
  min-height: 0;
  flex: 1 1 auto;
}
.gm-hud__dialog-side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.gm-hud__dialog-filter-wrap {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex: 0 0 auto;
}
.gm-hud__dialog-filter {
  width: 100%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 150, 60, 0.22);
  color: #f4e6d8;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 1.5px;
  padding: 8px 9px;
  outline: none;
}
.gm-hud__dialog-filter::placeholder {
  color: rgba(244, 230, 216, 0.35);
}
.gm-hud__dataset-list {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}
.gm-hud__dataset-group {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: rgba(18, 13, 19, 0.97);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 2px;
  color: ${ACCENT};
}
.gm-hud__dataset-group-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gm-hud__dataset-group-count {
  color: rgba(244, 230, 216, 0.35);
}
.gm-hud__dataset-row {
  display: block;
  width: 100%;
  padding: 8px 12px 8px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  border-left: 2px solid transparent;
  font-size: 12.5px;
  letter-spacing: 1px;
  color: rgba(244, 230, 216, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gm-hud__dataset-row:hover {
  background: rgba(255, 150, 60, 0.12);
}
.gm-hud__dataset-row[aria-current='true'] {
  border-left-color: ${ACCENT};
  color: ${ACCENT};
}
.gm-hud__dataset-row[aria-pressed='true'] {
  background: rgba(255, 150, 60, 0.16);
  color: ${ACCENT};
}
.gm-hud__dataset-empty,
.gm-hud__dataset-cut {
  padding: 16px 12px;
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 1.5px;
  color: rgba(244, 230, 216, 0.4);
}
.gm-hud__dataset-cut {
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex: 0 0 auto;
}
.gm-hud__dialog-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.gm-hud__detail-body {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
  padding: 16px 18px;
}
.gm-hud__detail-label {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: #ffb055;
}
.gm-hud__detail-meta {
  font-family: ${MONO};
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba(244, 230, 216, 0.45);
  margin-top: 10px;
}
.gm-hud__detail-description {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(244, 230, 216, 0.85);
  white-space: pre-line;
}
.gm-hud__dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex: 0 0 auto;
}
.gm-hud__dialog-cancel {
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 2px;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(244, 230, 216, 0.65);
}
.gm-hud__dialog-cancel:hover {
  background: rgba(255, 255, 255, 0.08);
}
.gm-hud__dialog-load {
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 2px;
  padding: 9px 16px;
  border: 1px solid ${ACCENT};
  background: rgba(255, 150, 60, 0.2);
  color: ${ACCENT};
}
.gm-hud__dialog-load:hover {
  background: rgba(255, 150, 60, 0.28);
}
.gm-hud__dialog-load[aria-disabled='true'] {
  border-color: rgba(255, 150, 60, 0.3);
  background: rgba(255, 150, 60, 0.1);
  color: rgba(244, 230, 216, 0.5);
  cursor: default;
}
.gm-hud__dialog-load[aria-disabled='true']:hover {
  background: rgba(255, 150, 60, 0.1);
}

.gm-hud__lightbox {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  z-index: 60;
  cursor: zoom-out;
  background: rgba(4, 3, 6, 0.88);
}
.gm-hud__lightbox-frame {
  position: relative;
  width: min(86%, 1180px);
  aspect-ratio: 4 / 3;
  max-height: 82%;
  border: 1px solid rgba(255, 150, 60, 0.45);
  background-color: #140e12;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 150, 60, 0.12) 0 12px,
    rgba(255, 150, 60, 0) 12px 26px
  );
  box-shadow: 0 0 90px rgba(0, 0, 0, 0.8);
}
.gm-hud__lightbox-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  font-family: ${MONO};
  font-size: 12px;
  letter-spacing: 3px;
  color: rgba(244, 230, 216, 0.55);
}
.gm-hud__lightbox-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.gm-hud__lightbox-close {
  position: absolute;
  top: -1px;
  right: -1px;
  padding: 7px 12px;
  background: rgba(255, 150, 60, 0.16);
  border: 1px solid rgba(255, 150, 60, 0.45);
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 2px;
  color: ${ACCENT};
}
.gm-hud__lightbox-close:hover {
  background: rgba(255, 150, 60, 0.3);
}
.gm-hud__lightbox-footer {
  position: absolute;
  bottom: -30px;
  left: 0;
  right: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(244, 230, 216, 0.45);
}
`;

/**
 * Adds the style element to a document, once. A second map in the same page finds the
 * element already there and adds nothing.
 */
export function addHudStyles(doc: Document): void {
  if (doc.getElementById(HUD_STYLE_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = HUD_STYLE_ID;
  style.textContent = styleText;
  doc.head.appendChild(style);
}
