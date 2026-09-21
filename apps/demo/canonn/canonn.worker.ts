// Parses the files of one Canonn entry, off the main thread.
//
// The page fetches each file and moves its bytes here, so the request still comes from
// the page and the browser test still intercepts it. The worker decodes the bytes,
// parses the JSON and gives each record the category names the map gives its keys. The
// largest entry holds 47,331 records over 5 files and about 4 MB of JSON, which the main
// thread would pay in dropped frames.
//
// The worker packs the records into buffers and does not hand back objects: a clone of
// 47,331 record objects costs the page 38 to 48 milliseconds, against 22 to 23
// milliseconds of parse here. `CanonnPacked` says what the buffers hold.
import type {
  CanonnAnswer,
  CanonnPacked,
  CanonnRequest,
  CanonnSet,
} from './canonn-message';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Reads the files of one entry and packs the records.
 *
 * A record carries keys and no names, because one file serves every map that reads the
 * source. The names come from the manifest row of the entry, so two entries that read
 * one file show their own map's category names. The reader drops a key this map does not
 * name, and drops a record that keeps no name.
 */
function packOf(request: CanonnRequest): CanonnPacked {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const names: string[] = [];
  const descriptions: string[] = [];
  const coords: number[] = [];
  const categoryNames: string[] = [];
  const categoryIndex = new Map<string, number>();
  const categories: number[] = [];
  const starts: number[] = [0];
  let anyDescription = false;

  for (const file of request.files) {
    const set = JSON.parse(decoder.decode(file.bytes)) as CanonnSet;
    for (const record of set.records) {
      const first = categories.length;
      for (const key of record.keys ?? ['']) {
        const name = file.names[key];
        if (name === undefined) continue;
        let index = categoryIndex.get(name);
        if (index === undefined) {
          index = categoryNames.length;
          // The indices pack into a `Uint16Array`, so the names stop at 65,536. The
          // largest entry names 35 today, and a set that passed the bound would
          // otherwise wrap and give every record over it another map's category.
          if (index > 0xffff) {
            throw new Error(`The entry names more than ${0x10000} categories.`);
          }
          categoryNames.push(name);
          categoryIndex.set(name, index);
        }
        if (!categories.includes(index, first)) categories.push(index);
      }
      if (categories.length === first) continue;
      if (record.name.includes('\n')) {
        throw new Error(`The record name ${record.name} holds a line break.`);
      }
      const description = record.description ?? '';
      if (description.includes('\u0000')) {
        throw new Error(`The description of ${record.name} holds a NUL.`);
      }
      if (description !== '') anyDescription = true;
      names.push(record.name);
      descriptions.push(description);
      coords.push(record.coords.x, record.coords.y, record.coords.z);
      starts.push(categories.length);
    }
  }

  return {
    count: names.length,
    coords: new Float64Array(coords).buffer,
    names: encoder.encode(names.join('\n')).buffer as ArrayBuffer,
    descriptions: anyDescription
      ? (encoder.encode(descriptions.join('\u0000')).buffer as ArrayBuffer)
      : new ArrayBuffer(0),
    categoryNames,
    categories: new Uint16Array(categories).buffer,
    categoryStarts: new Uint32Array(starts).buffer,
  };
}

scope.addEventListener('message', (event: MessageEvent<CanonnRequest>) => {
  const start = Date.now();
  try {
    const packed = packOf(event.data);
    const answer: CanonnAnswer = {
      packed,
      parseMs: Date.now() - start,
      sentAt: Date.now(),
    };
    scope.postMessage(answer, [
      packed.coords,
      packed.names,
      packed.descriptions,
      packed.categories,
      packed.categoryStarts,
    ]);
  } catch (cause) {
    const answer: CanonnAnswer = {
      error: cause instanceof Error ? cause.message : String(cause),
    };
    scope.postMessage(answer);
  }
});
