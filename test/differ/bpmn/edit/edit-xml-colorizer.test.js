'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditXmlColorizer, DiffType } = createScope();

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D_1">
    <bpmndi:BPMNPlane id="P_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" />
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1" />
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const entry = (diffType, outlineOnly = false) => ({ diffType, outlineOnly });

describe('EditXmlColorizer', () => {
    it('fills a shape with the diff type shape colour, in both namespaces', () => {
        const out = EditXmlColorizer.apply(XML, new Map([['Task_1', entry(DiffType.ADD)]]));
        assert.match(out, /Task_1_di[^>]*color:background-color="#88ff88"/);
        assert.match(out, /Task_1_di[^>]*bioc:fill="#88ff88"/);
    });

    it('strokes an edge with the diff type row colour, in both namespaces', () => {
        // A connection shows its diff in the stroke, not the fill.
        const out = EditXmlColorizer.apply(XML, new Map([['Flow_1', entry(DiffType.CHANGE)]]));
        assert.match(out, /Flow_1_di[^>]*color:border-color="#0000aa"/);
        assert.match(out, /Flow_1_di[^>]*bioc:stroke="#0000aa"/);
    });

    it('declares both colour namespaces on the root', () => {
        // bpmn-js emits these declarations only when the MODEL carries such
        // attributes; we add them after the export, so we must declare them
        // ourselves or the file is not valid XML.
        const out = EditXmlColorizer.apply(XML, new Map([['Task_1', entry(DiffType.ADD)]]));
        assert.match(out, /xmlns:color="http:\/\/www\.omg\.org\/spec\/BPMN\/non-normative\/color\/1\.0"/);
        assert.match(out, /xmlns:bioc="http:\/\/bpmn\.io\/schema\/bpmn\/biocolor\/1\.0"/);
    });

    it('leaves an outline-only element alone', () => {
        // It already carries its own colour in the model; overwriting it here is
        // exactly the "user colour beats the diff colour" rule being broken.
        const out = EditXmlColorizer.apply(
            XML, new Map([['Task_1', entry(DiffType.ADD, true)]]));
        assert.doesNotMatch(out, /color:background-color/);
    });

    it('returns the XML untouched for an empty map', () => {
        const out = EditXmlColorizer.apply(XML, new Map());
        assert.doesNotMatch(out, /color:background-color/);
        assert.doesNotMatch(out, /xmlns:color=/);
    });

    it('ignores ids with no bpmndi element', () => {
        // Assert the whole string, not the absence of a substring the fixture never
        // had: this pins down "nothing painted, so no namespace declarations either".
        const out = EditXmlColorizer.apply(XML, new Map([['Ghost_1', entry(DiffType.ADD)]]));
        assert.equal(out, XML);
    });

    it('keeps the XML declaration that bpmn-js writes', () => {
        // XMLSerializer drops the prolog; losing it would change the very first
        // line of every downloaded file relative to the repo's other .bpmn files.
        const out = EditXmlColorizer.apply(XML, new Map([['Task_1', entry(DiffType.ADD)]]));
        assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    });
});
