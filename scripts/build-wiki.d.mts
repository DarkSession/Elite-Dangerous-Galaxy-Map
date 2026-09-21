// The types of what the wiki build exports. The script itself is JavaScript, because
// node runs it directly with no build step, and `scripts/` is outside the `include` list
// of tsconfig.json. `tests/wiki-pages.test.ts` imports the passes, so it reads these.

/** The page names a section folder holds, by folder name. */
export type WikiSections = Map<string, string[]>;

/** Every page name written so far, against the source it came from. */
export type WikiPages = Map<string, string>;

export declare function rewriteLinks(text: string): string;

export declare function generate(outDirectory: string): void;

export declare function arrange(
  generatedDirectory: string,
  treeDirectory: string,
  pages: WikiPages,
): WikiSections;

export declare const SAMPLE_BASE_URL: string;

export declare function sampleRegion(id: string, source: string): string;

export declare function copyProse(
  docsDirectory: string,
  treeDirectory: string,
  pages: WikiPages,
  samplesDirectory?: string,
): string[];

export declare function sidebarText(
  sections: WikiSections,
  openSection: string | null,
): string;

export declare function writeSidebars(
  sections: WikiSections,
  treeDirectory: string,
): void;

export declare function buildWiki(options?: {
  docsDirectory?: string;
  outDirectory?: string;
  samplesDirectory?: string;
}): string;
