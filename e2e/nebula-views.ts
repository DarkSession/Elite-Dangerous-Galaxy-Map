// The views the nebula specs open.
//
// Two spec files read them: `e2e/nebulae.spec.ts`, which the Chromium project runs, and
// `e2e/nebulae-firefox.spec.ts`, which the Firefox project runs. They sit here and not
// in either file, beside `e2e/region-views.ts`, so the two specs read one view and a
// copied string cannot drift from it.
//
// This file holds no import on purpose, as `e2e/region-views.ts` does.

/**
 * Barnard's Loop, the largest record in the set at 200 light years. The view puts it at
 * the middle of the frame at a zoom distance inside the band, where it draws about 21
 * CSS pixels across the radius and the next record is under half that.
 */
export const BRIGHT_VIEW = '#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0';

/**
 * A dark nebula of 88.93 light years. It is the largest record in the middle of this
 * frame, so the block the test samples reads its volume.
 */
export const DARK_VIEW = '#c=-10642.7,629.4,17776.7&d=6000&p=35&y=0';

/**
 * Barnard's Loop again, with the camera 1,000 light years from it and the zoom well
 * inside the close range. The near end of the band is open, so the record draws here
 * about six times as wide as it does at 6,000 light years.
 */
export const CLOSE_VIEW = '#c=624.4,-425.9,-1229.5&d=1000&p=35&y=0';
