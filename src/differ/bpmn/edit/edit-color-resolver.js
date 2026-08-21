// FEAT-0031, edit mode: the colour-layer table as a pure function.
//
// Four layers decide what an element looks like; the topmost that applies wins:
//   1. a colour the user set via the colour control   — lives in the model
//   2. my edits vs the baseline (green/blue)          — painted by us
//   3. the MR diff, when opened from diff view        — painted by us
//   4. a colour that came with the file               — lives in the model
//
// Layers 1 and 4 are indistinguishable in the model and are meant to behave the
// same, so they arrive here merged as `explicitlyColoredIds` — an element in that
// set keeps its own colour and gets a dashed OUTLINE in the diff colour instead
// of a fill, so an edit is never invisible. Layers 2 and 3 arrive as `layers`,
// highest priority first.
//
// Nothing here touches the model or the DOM: the same map drives the on-screen
// marker layer (EditDiffPainter) and the exported XML (EditXmlColorizer), which
// is what lets one toggle honestly govern both.
class EditColorResolver {
    // layers: [{ ids: string[], diffType: DiffType.* }, ...] — first match wins.
    // Returns Map<elementId, { diffType, outlineOnly }>. An empty `layers` (the
    // "colour the edits" toggle turned off) yields an empty map.
    static resolve(layers, explicitlyColoredIds = new Set()) {
        const result = new Map();
        for (const layer of layers) {
            for (const id of layer.ids || []) {
                if (result.has(id)) {
                    continue;
                }
                result.set(id, {
                    diffType: layer.diffType,
                    outlineOnly: explicitlyColoredIds.has(id)
                });
            }
        }
        return result;
    }

    // Ids of elements that carry an explicit colour in the model — read fresh from
    // the registry on every recompute rather than tracked, so "reset an element to
    // Default brings its diff colour back" needs no bookkeeping. The attribute
    // names mirror what bpmn-js reads (BpmnRenderUtil#getFillColor/getStrokeColor):
    // the OMG non-normative `color:*` pair plus the legacy `bioc:*` one.
    static explicitlyColoredIdsOf(elementRegistry) {
        const ids = new Set();
        for (const element of elementRegistry.getAll()) {
            const di = element.di;
            if (!di || typeof di.get !== 'function') {
                continue;
            }
            const colored = di.get('color:background-color') || di.get('bioc:fill')
                || di.get('color:border-color') || di.get('bioc:stroke');
            if (colored) {
                ids.add(element.id);
            }
        }
        return ids;
    }
}
