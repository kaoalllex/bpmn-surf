// Used by both bpmn-differ.js and dmn-differ.js
class DiffType {
    static ADD = {
        name: 'added',
        shapeColor: '#88ff88',
        rowColor: '#00aa00'
    }
    static CHANGE = {
        name: 'changed',
        shapeColor: '#8888ff',
        rowColor: '#0000aa'
    }
    static REMOVE = {
        name: 'removed',
        shapeColor: '#ff8888',
        rowColor: '#aa0000'
    }
    // BPMN pools and lanes take the row colour as a thick border (the marker, see
    // styles.css) instead of the fill, which would bury the changes inside them.
    static STROKED_SHAPE_TYPES = ['bpmn:Participant', 'bpmn:Lane'];
    static STROKED_SHAPE_MARKER = 'diff-stroked-shape';
}
