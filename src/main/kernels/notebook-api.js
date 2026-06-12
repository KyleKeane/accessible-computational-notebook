/**
 * Main-process side of the in-kernel notebook automation API: dispatches
 * `api` requests from a kernel (see runners) against the NotebookStore.
 * Pure Node (no Electron imports) so the full loop is testable headlessly.
 *
 * Cell indices are 0-based and refer to the current document order.
 */

export function createNotebookApi(store) {
  const cellAt = (index) => {
    const cell = store.cells[index];
    if (!cell) throw new Error(`No cell at index ${index} (notebook has ${store.cellCount})`);
    return cell;
  };

  return {
    cell_count: () => store.cellCount,

    get_cells: () =>
      store.cells.map((cell, index) => ({
        index,
        id: cell.id,
        type: cell.type,
        source: cell.source
      })),

    get_source: ({ index }) => cellAt(index).source,

    set_source: ({ index, source }) => {
      store.updateSource(cellAt(index).id, String(source));
      return true;
    },

    insert_cell: ({ source = '', type = 'code', index = null }) => {
      let cell;
      if (index === null || index === undefined || index >= store.cellCount) {
        cell = store.insertCell({ type, source: String(source) });
      } else {
        cell = store.insertCell({
          type,
          source: String(source),
          relativeTo: cellAt(index).id,
          position: 'above'
        });
      }
      return { index: store.indexOf(cell.id), id: cell.id };
    },

    delete_cell: ({ index }) => {
      if (!store.deleteCell(cellAt(index).id)) {
        throw new Error('Cannot delete the only cell');
      }
      return true;
    }
  };
}

/** Run one request against the api object; returns the result value. */
export function handleApiRequest(api, request) {
  const method = api[request.method];
  if (!method) throw new Error(`Unknown notebook API method: ${request.method}`);
  return method(request.args ?? {});
}
