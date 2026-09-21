// Builds the repository's GitHub wiki into `wiki-build/` at the repository root.
//
// `pnpm docs:wiki` runs this, and the `publish-wiki` job of `.github/workflows/ci.yml`
// runs the same script. A developer therefore reads what the pipeline pushes.
//
// The build runs in three passes:
//
// 1. **Generate.** The prose pages of `docs/wiki/` are copied in, then TypeDoc writes
//    one markdown page per exported member of the two supported entry points into a
//    scratch directory under the system temp directory. `typedoc.json` holds its
//    settings. The prose copy is first because it is the pass that fails on a missing
//    file, and TypeDoc is the slow one.
// 2. **Arrange.** The two modules TypeDoc writes merge into one set of wiki sections,
//    and every link becomes the bare page name. A wiki serves every page from one flat
//    set of names, whatever folder holds the file, so a folder never appears in a link.
// 3. **Sidebars.** One entry list is built once and written n+1 times: `_Sidebar.md` at
//    the root with every block closed, and one in each section folder with that section
//    alone open. A wiki resolves `_Sidebar.md` per folder, which is what makes the open
//    block follow the page.
//
// The whole tree is built in a temporary directory and moved into place at the end, so a
// failure leaves the last build where it was.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * The wiki section of each group directory TypeDoc writes. The build fails on a group
 * this map does not name, rather than write a tree with a section missing.
 */
const SECTION_OF_GROUP = new Map([
  ['classes', 'Classes'],
  ['interfaces', 'Interfaces'],
  ['type-aliases', 'Type-Aliases'],
  ['variables', 'Variables'],
  ['functions', 'Functions'],
]);

/**
 * The import specifier of each module TypeDoc writes. The wiki merges the two entry
 * points into one set of sections, so the page itself has to say which one it comes
 * from: a reader who reaches `nebulae` from the sidebar must not write the bare package
 * name. TypeDoc names a module after its entry file, so `src/index.ts` is `index` and
 * `src/nebulae/index.ts` is `nebulae`.
 */
const SPECIFIER_OF_MODULE = new Map([
  ['index', '@elite-dangerous-almanac/galaxy-map'],
  ['nebulae', '@elite-dangerous-almanac/galaxy-map/nebulae'],
]);

/**
 * The collapsible blocks of the sidebar, in the reader's order, as the folder name and
 * the title of the block. A block with no page is dropped.
 */
const SECTIONS = [
  ['Examples', 'Examples'],
  ['Classes', 'Classes'],
  ['Interfaces', 'Interfaces'],
  ['Type-Aliases', 'Type Aliases'],
  ['Variables', 'Variables'],
  ['Functions', 'Functions'],
];

/**
 * The three pages that belong to no section, as the file name and the sidebar title.
 * Each one is a file of `docs/wiki/` and the build fails where one is missing. `Home` is
 * GitHub's name for the landing page of a wiki, not a choice.
 */
const SINGLE_PAGES = [
  ['Home', 'Overview'],
  ['Getting-started', 'Getting started'],
  ['Testing-subpath', 'The testing subpath'],
];

/** The names of the files of a directory, sorted, so two runs read the same order. */
function sortedNames(directory) {
  return readdirSync(directory).sort();
}

/**
 * Rewrites every link to a markdown page as the bare page name. A wiki serves
 * `Interfaces/GalaxyMap.md` at `/wiki/GalaxyMap`, so a link that carries a folder or the
 * extension resolves to nothing. A target that is not a markdown path — an address with
 * a scheme, an anchor of the same page — is left as it is.
 */
export function rewriteLinks(text) {
  return text.replace(/\]\(([^)\s]+)\)/g, (whole, target) =>
    target.endsWith('.md') && !target.includes(':')
      ? `](${basename(target, '.md')})`
      : whole,
  );
}

/**
 * Runs TypeDoc over the entry points `typedoc.json` names and writes its markdown into
 * `outDirectory`. It throws with TypeDoc's own output where TypeDoc fails.
 */
export function generate(outDirectory) {
  try {
    execFileSync(
      join(root, 'node_modules', '.bin', 'typedoc'),
      ['--out', outDirectory],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
  } catch (reason) {
    const output = `${reason.stdout ?? ''}${reason.stderr ?? ''}`.trim();
    throw new Error(`TypeDoc failed:\n${output}`, { cause: reason });
  }
}

/**
 * Merges the modules TypeDoc wrote into one set of wiki sections under `treeDirectory`.
 *
 * TypeDoc writes `<module>/<group>/<member>.md` for two entry points, and the wiki shows
 * one list per kind, so a member of either module lands in the same section. It gives
 * back a map of section folder to the page names it holds, sorted.
 *
 * `pages` is the name of every page written so far, against its source. A wiki holds one
 * flat set of page names, so a second file of one name would replace the first; the pass
 * fails instead, and names both sources.
 */
export function arrange(generatedDirectory, treeDirectory, pages) {
  const sections = new Map();
  for (const moduleName of sortedNames(generatedDirectory)) {
    const modulePath = join(generatedDirectory, moduleName);
    // TypeDoc writes a `README.md` index beside the module folders and one inside each
    // of them. The wiki has its own navigation, so neither is copied.
    if (!statSync(modulePath).isDirectory()) continue;
    const specifier = SPECIFIER_OF_MODULE.get(moduleName);
    if (specifier === undefined) {
      throw new Error(
        `the wiki build does not know the module '${moduleName}', which TypeDoc wrote. ` +
          `Add it to SPECIFIER_OF_MODULE in scripts/build-wiki.mjs, with the specifier ` +
          `a host imports it by.`,
      );
    }
    for (const group of sortedNames(modulePath)) {
      const groupPath = join(modulePath, group);
      if (!statSync(groupPath).isDirectory()) continue;
      const section = SECTION_OF_GROUP.get(group);
      if (section === undefined) {
        throw new Error(
          `the wiki build does not know the group directory '${group}', which TypeDoc ` +
            `wrote at '${moduleName}/${group}'. Add it to SECTION_OF_GROUP in ` +
            `scripts/build-wiki.mjs, with the wiki section it belongs in.`,
        );
      }
      for (const file of sortedNames(groupPath)) {
        if (!file.endsWith('.md')) continue;
        const page = basename(file, '.md');
        const source = `${moduleName}/${group}/${file}`;
        claim(pages, page, source);
        mkdirSync(join(treeDirectory, section), { recursive: true });
        writeFileSync(
          join(treeDirectory, section, file),
          nameSource(
            rewriteLinks(readFileSync(join(groupPath, file), 'utf8')),
            specifier,
          ),
        );
        const held = sections.get(section);
        if (held === undefined) sections.set(section, [page]);
        else held.push(page);
      }
    }
  }
  // Two modules each write their own sorted run, so the merged section is sorted here.
  for (const held of sections.values()) held.sort();
  return sections;
}

/**
 * Copies the hand-written pages of `docsDirectory` into the tree: the three pages that
 * belong to no section, and every page of `Examples/`. It fails, naming the file, where
 * one of the three is missing.
 */
export function copyProse(docsDirectory, treeDirectory, pages) {
  for (const [name] of SINGLE_PAGES) {
    const file = join(docsDirectory, `${name}.md`);
    if (!exists(file)) {
      throw new Error(
        `the wiki sidebar names the page '${name}', and the file '${file}' is missing. ` +
          `Write it, or take the page out of SINGLE_PAGES in scripts/build-wiki.mjs.`,
      );
    }
    claim(pages, name, file);
    cpSync(file, join(treeDirectory, `${name}.md`));
  }

  const examplesDirectory = join(docsDirectory, 'Examples');
  if (!exists(examplesDirectory)) return [];
  const examples = [];
  for (const file of sortedNames(examplesDirectory)) {
    if (!file.endsWith('.md')) continue;
    const page = basename(file, '.md');
    claim(pages, page, join(examplesDirectory, file));
    mkdirSync(join(treeDirectory, 'Examples'), { recursive: true });
    cpSync(join(examplesDirectory, file), join(treeDirectory, 'Examples', file));
    examples.push(page);
  }
  return examples;
}

/**
 * The text of one sidebar. `openSection` is the folder whose block carries `open`, or
 * null at the root, where every block is closed. Every sidebar of the wiki holds the
 * same entries in the same order, so the files differ in that one attribute alone.
 */
export function sidebarText(sections, openSection) {
  const blocks = [
    SINGLE_PAGES.map(([name, title]) => `- [${title}](${name})`).join('\n'),
  ];
  for (const [folder, title] of SECTIONS) {
    const held = sections.get(folder);
    if (held === undefined || held.length === 0) continue;
    // The link text reads the page name with its hyphens as spaces, which suits the
    // example pages. No exported member carries a hyphen, so a member reads unchanged.
    const links = held
      .map((page) => `- [${page.replaceAll('-', ' ')}](${page})`)
      .join('\n');
    const open = folder === openSection ? ' open' : '';
    // The blank line after the summary and before the closing tag is what makes GitHub
    // render the markdown inside the block.
    blocks.push(
      `<details${open}>\n  <summary><b>${title}</b></summary>\n\n${links}\n\n</details>`,
    );
  }
  return `${blocks.join('\n\n')}\n`;
}

/** Writes the root sidebar and one sidebar in each section folder of the tree. */
export function writeSidebars(sections, treeDirectory) {
  writeFileSync(join(treeDirectory, '_Sidebar.md'), sidebarText(sections, null));
  for (const folder of sections.keys()) {
    writeFileSync(
      join(treeDirectory, folder, '_Sidebar.md'),
      sidebarText(sections, folder),
    );
  }
}

/**
 * Builds the whole wiki tree. It writes nothing until every pass has passed: the tree is
 * built in a temporary directory and moved into `outDirectory` at the end.
 */
export function buildWiki({
  docsDirectory = join(root, 'docs', 'wiki'),
  outDirectory = join(root, 'wiki-build'),
} = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'galaxy-map-wiki-'));
  try {
    const generated = join(scratch, 'typedoc');
    const tree = join(scratch, 'tree');
    mkdirSync(tree, { recursive: true });

    // The prose copy runs first because it is the cheap pass, and the one that fails on
    // a missing file. A build with a page missing therefore fails before TypeDoc runs.
    const pages = new Map();
    const examples = copyProse(docsDirectory, tree, pages);
    generate(generated);
    const sections = arrange(generated, tree, pages);
    if (examples.length > 0) sections.set('Examples', examples);
    writeSidebars(sections, tree);

    // The swap. Every pass that can fail has already run, so a build that got this far
    // has a whole tree to put in place. The swap is a remove and a copy rather than an
    // atomic rename, because the scratch tree is under the system temp directory and a
    // rename fails across two filesystems. It is therefore not atomic: a copy that the
    // disk cuts short leaves `wiki-build/` half written, and the next run rebuilds it.
    rmSync(outDirectory, { recursive: true, force: true });
    cpSync(tree, outDirectory, { recursive: true });
    return outDirectory;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Puts the import specifier under the heading of a generated page. The two entry points
 * share one set of sections, so which one a member comes from is on the member's own
 * page and nowhere else: the page header and the breadcrumbs are both off, because they
 * name a folder tree the wiki does not have.
 */
function nameSource(text, specifier) {
  const [heading, ...rest] = text.split('\n');
  return [heading, '', `Imported from \`${specifier}\`.`, ...rest].join('\n');
}

/** Whether a path is there. */
function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Records a page name, and fails where the tree already holds one of that name. */
function claim(pages, page, source) {
  const held = pages.get(page);
  if (held !== undefined) {
    throw new Error(
      `the wiki build writes the page '${page}' twice, from '${held}' and from ` +
        `'${source}'. A wiki serves every page from one flat set of names, so the ` +
        `second would replace the first. Rename one of them.`,
    );
  }
  pages.set(page, source);
}

// `pnpm docs:wiki` runs the file. `tests/wiki-pages.test.ts` imports the passes instead,
// so the build runs in the suite without this block.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(`the wiki tree is at ${buildWiki()}`);
  } catch (reason) {
    console.error(reason instanceof Error ? reason.message : String(reason));
    process.exitCode = 1;
  }
}
