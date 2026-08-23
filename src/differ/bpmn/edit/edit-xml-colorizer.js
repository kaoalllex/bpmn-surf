// FEAT-0031, edit mode: writes the resolved diff colours into the XML that
// saveXML() produced, so the downloaded file looks the way the canvas looked.
//
// The colours are deliberately NOT in the model — painting them there would put
// colour commands on the user's undo stack (see the colour model in FEAT-0031) —
// so they are added here, after the export, as a pure string transform.
//
// bpmn-js writes both the OMG non-normative `color:*` attributes and the legacy
// `bioc:*` ones (SetColorHandler#ensureLegacySupport); Camunda Modeler and bpmn.io
// read that pair, so we write both too. Because the model never carried these
// attributes, bpmn-js also never emitted their namespace declarations — we add
// them ourselves, otherwise the prefixes are undeclared and the file is invalid.
class EditXmlColorizer {
    static COLOR_NS = 'http://www.omg.org/spec/BPMN/non-normative/color/1.0';
    static BIOC_NS = 'http://bpmn.io/schema/bpmn/biocolor/1.0';

    // xml: the string from saveXML(); colorById: the EditColorResolver map.
    // Entries flagged outlineOnly are skipped: that element already carries its
    // own colour in the model and it must win (it only gets a dashed outline on
    // screen, which is a screen-only affordance).
    static apply(xml, colorById) {
        if (!colorById || colorById.size === 0) {
            return xml;
        }
        const doc = parseXml(xml);
        const root = doc.documentElement;
        let painted = false;

        // The prefix is bpmn-js' own — this XML came straight out of saveXML().
        const diElements = [
            ...doc.getElementsByTagName('bpmndi:BPMNShape'),
            ...doc.getElementsByTagName('bpmndi:BPMNEdge')
        ];
        for (const di of diElements) {
            const entry = colorById.get(di.getAttribute('bpmnElement'));
            if (!entry || entry.outlineOnly) {
                continue;
            }
            if (di.tagName === 'bpmndi:BPMNEdge') {
                di.setAttribute('color:border-color', entry.diffType.rowColor);
                di.setAttribute('bioc:stroke', entry.diffType.rowColor);
            } else {
                di.setAttribute('color:background-color', entry.diffType.shapeColor);
                di.setAttribute('bioc:fill', entry.diffType.shapeColor);
            }
            painted = true;
        }

        if (!painted) {
            return xml;
        }
        root.setAttribute('xmlns:color', EditXmlColorizer.COLOR_NS);
        root.setAttribute('xmlns:bioc', EditXmlColorizer.BIOC_NS);
        // bpmn-js always writes an XML declaration, and losing it would make the
        // downloaded file differ from every other .bpmn in the repo on its very
        // first line. Whether the serializer keeps it depends on the implementation
        // — Chrome re-emits the parsed prolog, jsdom drops it — so carry the
        // original over only when it is actually missing; prepending it blindly
        // produced a file with two declarations, which is not well-formed XML.
        const prolog = xml.match(/^\s*<\?xml[^>]*\?>\s*/);
        const serialized = new XMLSerializer().serializeToString(doc);
        return prolog && !/^\s*<\?xml/.test(serialized) ? prolog[0] + serialized : serialized;
    }
}
