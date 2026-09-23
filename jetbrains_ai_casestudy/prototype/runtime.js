/*
 * Tiny binding runtime for the redesign prototype.
 *
 * The prototype's markup lives in <template id="tpl"> with {{holes}}. logic.js defines
 * `class Component extends DCLogic` whose renderVals() returns the value for every hole:
 * strings for text / attributes, functions for onclick handlers.
 *
 * mount() clones the template ONCE, remembers which text nodes and attributes contain holes,
 * and on every setState() patches only those in place. Elements are never re-created, so the
 * CSS transitions in the inline styles (accordion heights, the FAQ marker, the sliding
 * Individuals/Organizations pill, price fades) animate from their previous values.
 */
(function () {
  'use strict';
  var HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch);
    if (this.__schedule) this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };
  window.DCLogic = DCLogic;

  function mount(root, template, Comp, props) {
    var frag = template.content.cloneNode(true);
    var bindings = [];
    var walker = document.createTreeWalker(frag, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        if (node.nodeValue.indexOf('{{') !== -1) bindings.push({ kind: 'text', node: node, tpl: node.nodeValue });
        continue;
      }
      Array.prototype.slice.call(node.attributes).forEach(function (a) {
        if (a.value.indexOf('{{') === -1) return;
        if (a.name.indexOf('on') === 0) {                       // onclick="{{handler}}" -> real listener
          var key = a.value.replace(HOLE, '$1').trim();
          node.removeAttribute(a.name);
          bindings.push({ kind: 'event', node: node, event: a.name.slice(2), key: key });
        } else {
          bindings.push({ kind: 'attr', node: node, name: a.name, tpl: a.value });
        }
      });
    }

    var comp = new Comp(props || {});
    var vals = {};
    function lookup(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, vals); }
    function fill(str) { return str.replace(HOLE, function (_, k) { var v = lookup(k); return v == null ? '' : String(v); }); }

    bindings.forEach(function (b) {
      if (b.kind !== 'event') return;
      b.node.addEventListener(b.event, function (e) { var fn = lookup(b.key); if (typeof fn === 'function') fn(e); });
    });

    function render() {
      vals = comp.renderVals();
      for (var i = 0; i < bindings.length; i++) {
        var b = bindings[i];
        if (b.kind === 'text') { var t = fill(b.tpl); if (b.node.nodeValue !== t) b.node.nodeValue = t; }
        else if (b.kind === 'attr') { var v = fill(b.tpl); if (b.node.getAttribute(b.name) !== v) b.node.setAttribute(b.name, v); }
      }
    }
    var queued = false;
    comp.__schedule = function () {                              // batch state changes into one paint
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; render(); });
    };

    render();
    root.appendChild(frag);
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
    return comp;
  }

  window.DC = { mount: mount };
})();
