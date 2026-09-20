// The lint rules that hold the HUD boundary. The test sits beside the code it checks.
// The rules apply to this file as well, and it passes them: each broken case is a string
// that the test gives to `lintText`, and neither rule reads inside a string.
import { describe, expect, test } from 'vitest';
import { ESLint } from 'eslint';

/** The path the rules read. The file does not have to exist for `lintText`. */
const HUD_FILE = 'packages/galaxy-map/src/hud/scratch.ts';

/** The rule ids each broken case must report. */
const IMPORT_RULE = 'no-restricted-imports';
const SYNTAX_RULE = 'no-restricted-syntax';

/** Lints one piece of source as a file of the HUD. */
async function lintHud(source: string): Promise<ESLint.LintResult> {
  const eslint = new ESLint();
  const results = await eslint.lintText(source, { filePath: HUD_FILE });
  return results[0] as ESLint.LintResult;
}

describe('the lint rules on the HUD', () => {
  test('passes a file that reaches the map through the handle alone', async () => {
    const result = await lintHud(
      "import type { HudHandle } from './types';\n" +
        'export const handle = (value: HudHandle): HTMLElement => value.element;\n',
    );
    expect(result.errorCount).toBe(0);
  });

  test('fails an import of the renderer', async () => {
    const result = await lintHud(
      "import { createRenderer } from '../render/renderer';\nexport const make = createRenderer;\n",
    );
    expect(result.messages.map((message) => message.ruleId)).toContain(IMPORT_RULE);
  });

  test('fails an import of the scene data', async () => {
    const result = await lintHud(
      "import { regionNameAt } from '../scene-data/regions';\nexport const name = regionNameAt;\n",
    );
    expect(result.messages.map((message) => message.ruleId)).toContain(IMPORT_RULE);
  });

  test('fails an import of the camera', async () => {
    const result = await lintHud(
      "import type { View } from '../camera/view';\nexport const read = (value: View): number => value.distance;\n",
    );
    expect(result.messages.map((message) => message.ruleId)).toContain(IMPORT_RULE);
  });

  test('fails a read of the debug member', async () => {
    const result = await lintHud(
      'export const look = (map: { debug: { look: number } }): number => map.debug.look;\n',
    );
    expect(result.messages.map((message) => message.ruleId)).toContain(SYNTAX_RULE);
  });
});
