/*
 * Minimal binding runtime for the Bloom prototype reference build.
 *
 * WHY THIS EXISTS
 * ---------------
 * The prototype's markup lives in <template id="tpl"> and is written with {{holes}};
 * logic.js defines `class Component extends DCLogic` whose renderVals() returns a value
 * for every hole — strings for text and attributes, functions for onClick / onInput / etc.
 * This file is the ~200 lines that join the two. It is NOT a framework and is not meant
 * to ship: it is here so the reference build runs unmodified in any browser, and so you
 * can read the markup and the state machine as two separate, plain things.
 *
 * THE ONE IMPORTANT PROPERTY: it patches the DOM in place rather than re-rendering.
 * Elements are created once and only their changed text / attributes are written, so the
 * CSS transitions declared in the inline styles (toggle knobs sliding, the timer ring
 * sweeping, preset and tint cards tinting, the page reflowing in Research mode) animate
 * from their previous values. A naive "rebuild everything on setState" runtime looks
 * identical in a screenshot and wrong in motion.
 *
 * SUPPORTED SYNTAX
 *   {{ a.b.c }}                      dotted lookup, in text nodes and attribute values
 *   onClick="{{ handler }}"          any on<Event> attribute, bound once, resolved per call
 *   <sc-for list="{{xs}}" as="x">    repeats its children; {{x.y}} and {{$index}} in scope
 *   <sc-if value="{{flag}}">         attaches / detaches its children
 *
 * If you are porting this to React, Vue or Svelte: renderVals() is your derived state,
 * the holes are your bindings, and this file goes away entirely.
 */
(function (global) {
  'use strict';

  var HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;
  var vals = {};

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch);
    if (this.__schedule) this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };

  function lookup(scope, path) {
    var parts = path.split('.');
    var base = scope && Object.prototype.hasOwnProperty.call(scope, parts[0]) ? scope : vals;
    for (var i = 0; i < parts.length; i++) {
      if (base == null) return undefined;
      base = base[parts[i]];
    }
    return base;
  }
  function fill(tpl, scope) {
    return tpl.replace(HOLE, function (_, k) {
      var v = lookup(scope, k);
      return v == null ? '' : String(v);
    });
  }
  function soleHole(v) {
    var m = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/.exec(v);
    return m ? m[1] : null;
  }

  // ---- a region is one instantiated slice of template: its bindings and its blocks
  function region() { return { bindings: [], blocks: [], nodes: [] }; }

  function build(tplNode, scope, reg, dom) {
    var kids = tplNode.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];

      if (n.nodeType === 3) {                                   // text
        var t = document.createTextNode(n.nodeValue.indexOf('{{') === -1 ? n.nodeValue : '');
        if (n.nodeValue.indexOf('{{') !== -1) reg.bindings.push({ k: 'text', node: t, tpl: n.nodeValue, scope: scope });
        dom.appendChild(t);
        reg.nodes.push(t);
        continue;
      }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();

      if (tag === 'sc-for' || tag === 'sc-if') {
        var anchor = document.createComment(tag);
        dom.appendChild(anchor);
        reg.nodes.push(anchor);
        reg.blocks.push(tag === 'sc-for'
          ? { k: 'for', tpl: n, anchor: anchor, scope: scope, as: n.getAttribute('as') || 'item',
              list: soleHole(n.getAttribute('list') || '') || '', items: [] }
          : { k: 'if', tpl: n, anchor: anchor, scope: scope,
              cond: soleHole(n.getAttribute('value') || '') || '', inst: null });
        continue;
      }

      var el = n.namespaceURI === 'http://www.w3.org/2000/svg'
        ? document.createElementNS(n.namespaceURI, n.tagName)
        : document.createElement(n.tagName);

      for (var a = 0; a < n.attributes.length; a++) {
        var at = n.attributes[a], name = at.name, val = at.value;
        if (/^on[A-Za-z]/.test(name) && val.indexOf('{{') !== -1) {
          bindEvent(el, name.slice(2).toLowerCase(), soleHole(val), scope);
          continue;
        }
        if (val.indexOf('{{') === -1) { el.setAttribute(name, val); continue; }
        var isValue = name === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select');
        reg.bindings.push({ k: isValue ? 'value' : 'attr', node: el, name: name, tpl: val, scope: scope });
      }
      build(n, scope, reg, el);
      dom.appendChild(el);
      reg.nodes.push(el);
    }
  }

  function bindEvent(el, evt, key, scope) {
    el.addEventListener(evt, function (e) {
      var fn = lookup(scope, key);
      if (typeof fn === 'function') fn(e);
    });
  }

  // sc-for / sc-if structure, then values
  function sync(reg) {
    for (var b = 0; b < reg.blocks.length; b++) {
      var blk = reg.blocks[b];

      if (blk.k === 'if') {
        var on = !!lookup(blk.scope, blk.cond);
        if (on && !blk.inst) {
          blk.inst = region();
          var frag = document.createDocumentFragment();
          build(blk.tpl, blk.scope, blk.inst, frag);
          blk.anchor.parentNode.insertBefore(frag, blk.anchor);
        } else if (!on && blk.inst) {
          blk.inst.nodes.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
          blk.inst = null;
        }
        if (blk.inst) sync(blk.inst);
        continue;
      }

      var list = lookup(blk.scope, blk.list) || [];
      // Reuse item DOM whenever the length is unchanged — which is the case for every
      // fixed list (presets, tints, weights, themes), so their tint transitions survive.
      while (blk.items.length > list.length) {
        var drop = blk.items.pop();
        drop.nodes.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
      }
      while (blk.items.length < list.length) {
        var sc = Object.create(blk.scope);
        var inst = region();
        inst.scope = sc;
        var f = document.createDocumentFragment();
        build(blk.tpl, sc, inst, f);
        blk.anchor.parentNode.insertBefore(f, blk.anchor);
        blk.items.push(inst);
      }
      for (var i = 0; i < list.length; i++) {
        blk.items[i].scope[blk.as] = list[i];
        blk.items[i].scope.$index = i;
        sync(blk.items[i]);
      }
    }
  }

  function patch(reg) {
    for (var i = 0; i < reg.bindings.length; i++) {
      var b = reg.bindings[i], next = fill(b.tpl, b.scope);
      if (b.k === 'text') {
        if (b.node.nodeValue !== next) b.node.nodeValue = next;
      } else if (b.k === 'value') {
        if (b.node.value !== next) b.node.value = next;          // controlled input
      } else if (b.node.getAttribute(b.name) !== next) {
        b.node.setAttribute(b.name, next);
      }
    }
    for (var j = 0; j < reg.blocks.length; j++) {
      var blk = reg.blocks[j];
      if (blk.k === 'if') { if (blk.inst) patch(blk.inst); continue; }
      for (var k = 0; k < blk.items.length; k++) patch(blk.items[k]);
    }
  }

  function mount(host, template, Comp, props) {
    var comp = new Comp(props || {});
    var root = region();
    var frame = null;

    function render() {
      vals = comp.renderVals();
      sync(root);
      patch(root);
    }
    comp.__schedule = function () {
      if (frame) return;
      frame = requestAnimationFrame(function () { frame = null; render(); });
    };

    vals = comp.renderVals();
    build(template.content, {}, root, host);
    sync(root);
    patch(root);
    if (comp.componentDidMount) comp.componentDidMount();
    return comp;
  }

  global.DCLogic = DCLogic;
  global.DC = { mount: mount };
})(window);
