// The address of a catalog page: the loaded dataset and the view, so a reader can copy
// the URL and open the same picture. The dataset goes in the `dataset` query parameter
// and the view in the fragment, in the format `encodeView` of the library writes. The
// page owns the URL, not the library.
import { createFragmentWriter, decodeView } from '@elite-dangerous-almanac/galaxy-map';
import type { GalaxyMap, MapView } from '@elite-dangerous-almanac/galaxy-map';

/** The dataset id the URL names, or null. */
export function linkedDataset(): string | null {
  return new URLSearchParams(window.location.search).get('dataset');
}

/**
 * The view the fragment names, or undefined where it names none.
 *
 * `decodeView` answers with the default view whatever it is given, so a fragment that
 * names none of the four view fields would otherwise beat the start entry's own view.
 */
export function linkedView(): MapView | undefined {
  const fields = new URLSearchParams(window.location.hash.replace('#', ''));
  return ['c', 'd', 'p', 'y'].some((field) => fields.has(field))
    ? decodeView(window.location.hash)
    : undefined;
}

/** Writes the loaded dataset and the view to the URL whenever either changes. */
export function keepInUrl(map: GalaxyMap): void {
  const pageView: MapView = map.getView();
  const writer = createFragmentWriter(pageView, {
    write: (fragment) => {
      const url = new URL(window.location.href);
      const id = map.getLoadedDataset()?.id;
      if (id !== undefined) url.searchParams.set('dataset', id);
      url.hash = fragment;
      window.history.replaceState(null, '', url);
    },
  });
  map.onViewChange((view) => {
    pageView.cursor = view.cursor;
    pageView.distance = view.distance;
    pageView.yaw = view.yaw;
    pageView.pitch = view.pitch;
    writer.schedule();
  });
  map.onDatasetChange(() => writer.schedule());
  // A fragment pasted into the open page changes no query and loads no page.
  window.addEventListener('hashchange', () => {
    const view = linkedView();
    if (view !== undefined) map.setView(view);
  });
}
