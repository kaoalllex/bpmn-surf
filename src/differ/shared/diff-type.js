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
}
