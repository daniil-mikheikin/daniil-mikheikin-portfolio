/*
 * Prototype state machine — copied verbatim from the design.
 * Requires runtime.js (defines DCLogic + DC.mount). renderVals() returns every {{hole}} used in index.html.
 * Timings: marker 150ms, accordion 280ms, icon 90ms, price fade 130ms, pill slide 260ms; all multiplied by ?slow=N.
 */
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this._ensure();
    this.state = this._initialState();
  }
  _counts() { return {start: 8, pricing: 11, privacy: 5}; }
  _refs() { return {"r1_free_pill": 1, "r2_free_inc": 2, "r1_free_inc": 1, "r1_pro_pill": 1, "r1_pro_inc": 1, "r1_ult_pill": 1, "r1_ult_inc": 1, "r1_ent_pill": 1, "r1_ent_inc": 1, "r1_app_pill": 1, "r1_app_inc": 1, "r1_dot_pill": 1, "r1_dot_inc": 1}; }
  _initialState() {
    return {
      aud: { pro: 'p', ult: 'p', app: 'p', dot: 'p' },
      thumb: { pro: 'p', ult: 'p', app: 'p', dot: 'p' },
      fade: { pro: false, ult: false, app: false, dot: false },
      incOpen: null,
      back: null,
      cat: null, ul: null, ulOn: false, q: null, qIcon: null, bar: null, barOn: false
    };
  }
  _ensure() {
    if (this._m) return;
    var s = this._initialState();
    this._m = { aud: s.aud, thumb: s.thumb, fade: s.fade, incOpen: s.incOpen };
    this._v = { cat: s.cat, ul: s.ul, ulOn: s.ulOn, q: s.q, qIcon: s.qIcon, bar: s.bar, barOn: s.barOn };
    this._t = []; this._seq = 0; this._at = {};
  }
  componentWillUnmount() {
    this._clear();
    var at = this._at || {};
    Object.keys(at).forEach(function (k) { clearTimeout(at[k]); });
  }
  _reduced() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  _sc() {
    if (this._reduced()) return 0;
    var s = Number(this.props && this.props.slowMotion);
    return s > 0 ? s : 1;
  }
  _ms(base) { return Math.round(base * this._sc()); }
  _clear() { (this._t || []).forEach(function (t) { clearTimeout(t); }); this._t = []; }
  _patch(p) { Object.assign(this._v, p); this.setState(p); }
  _run(list) {
    this._ensure();
    var self = this, flat = [];
    list.forEach(function (s) { if (Array.isArray(s)) { flat = flat.concat(s); } else { flat.push(s); } });
    this._clear();
    var seq = ++this._seq, i = 0;
    function next() {
      if (seq !== self._seq) return;
      while (i < flat.length) {
        var r = flat[i++](self._v);
        if (r) {
          self._patch(r.p);
          if (r.w > 0) { self._t.push(setTimeout(next, r.w)); return; }
        }
      }
    }
    next();
  }
  // FAQ choreography. The marker lives as an underline under the open category while you move between
  // questions, and becomes a vertical bar beside the open answer. No underline until a category is clicked.
  _S() {
    var M = this._ms(150), E = this._ms(280), I = this._ms(90);
    return {
      barOff: function (v) { return v.barOn ? { p: { barOn: false }, w: M } : null; },
      ulShow: function (v) { return (!v.ulOn && v.cat !== null && v.ul === v.cat) ? { p: { ulOn: true }, w: M } : null; },
      ulHide: function (v) { return v.ulOn ? { p: { ulOn: false }, w: M } : null; },
      closeQ: function (v) { return (v.q !== null || v.qIcon !== null) ? { p: { q: null, qIcon: null, bar: null }, w: E } : null; },
      closeCat: function (v) { return v.cat !== null ? { p: { cat: null }, w: E } : null; },
      moveUl: function (c) {
        return [
          function (v) { return (v.ul !== c && v.ulOn) ? { p: { ulOn: false }, w: M } : null; },
          function (v) { return v.ul !== c ? { p: { ul: c }, w: 0 } : null; },
          function (v) { return v.ulOn ? null : { p: { ulOn: true }, w: M }; }
        ];
      },
      openCat: function (c) { return function (v) { return v.cat !== c ? { p: { cat: c }, w: E } : null; }; },
      openQ: function (j) {
        return [
          function () { return { p: { qIcon: j }, w: I }; },
          function () { return { p: { q: j }, w: E }; },
          function (v) { return v.ulOn ? { p: { ulOn: false }, w: M } : null; },
          function () { return { p: { bar: j, barOn: true }, w: M }; }
        ];
      }
    };
  }
  _onQ(c, j) {
    this._ensure();
    var v = this._v, S = this._S();
    if (v.cat !== c) { this._openTo(c, j); return; }
    if (v.q === j) { this._run([S.barOff, S.ulShow, S.closeQ]); }
    else { this._run([S.barOff, S.ulShow, S.closeQ, S.openQ(j)]); }
  }
  _onCat(c) {
    this._ensure();
    var v = this._v, S = this._S();
    if (v.cat === c) { this._run([S.barOff, S.ulShow, S.closeQ, S.closeCat, S.ulHide]); return; }
    var steps = [S.barOff, S.ulShow, S.closeQ, S.closeCat, S.moveUl(c), S.openCat(c)];
    if (this._counts()[c] > 0) steps.push(S.openQ(0));
    this._run(steps);
  }
  _openTo(c, j) {
    this._ensure();
    var v = this._v, S = this._S();
    if (v.cat === c) { if (v.q !== j) this._run([S.barOff, S.ulShow, S.closeQ, S.openQ(j)]); return; }
    this._run([S.barOff, S.ulShow, S.closeQ, S.closeCat, S.moveUl(c), S.openCat(c), S.openQ(j)]);
  }
  _aud(k, s) {
    this._ensure();
    var self = this, m = this._m;
    if (m.thumb[k] === s) return;
    clearTimeout(this._at[k]);
    m.thumb = Object.assign({}, m.thumb); m.thumb[k] = s;
    m.fade = Object.assign({}, m.fade); m.fade[k] = true;
    this.setState({ thumb: m.thumb, fade: m.fade });
    this._at[k] = setTimeout(function () {
      m.aud = Object.assign({}, m.aud); m.aud[k] = s;
      m.fade = Object.assign({}, m.fade); m.fade[k] = false;
      self.setState({ aud: m.aud, fade: m.fade });
    }, this._ms(130));
  }
  // One "What's included" open at a time; opening another closes the previous one.
  _inc(k) {
    this._ensure();
    this._m.incOpen = (this._m.incOpen === k) ? null : k;
    this.setState({ incOpen: this._m.incOpen });
  }
  renderVals() {
    this._ensure();
    var self = this;
    var st = (this.state && this.state.aud) ? this.state : this._initialState();
    var PR = {
      pro: { p: ['€10.00', 'incl. VAT €11.90'], c: ['€20.00', 'incl. VAT €23.80'] },
      ult: { p: ['€30.00', 'incl. VAT €35.70'], c: ['€60.00', 'incl. VAT €71.40'] },
      app: { p: ['€29.90', 'incl. VAT €35.58'], c: ['€97.90', 'incl. VAT €116.50'] },
      dot: { p: ['€21.90', 'incl. VAT €26.06'], c: ['€60.90', 'incl. VAT €72.47'] }
    };
    var M = this._ms(150), E = this._ms(280), EASE = 'cubic-bezier(.2,.8,.2,1)';
    var out = {};
    // Collapsible panel: animates height via grid rows; collapsed panels leave the tab order once closed.
    function panel(open, d) {
      return 'display:grid;grid-template-rows:' + (open ? '1fr' : '0fr') + ';opacity:' + (open ? 1 : 0) + ';visibility:' + (open ? 'visible' : 'hidden') + ';'
        + 'transition:grid-template-rows ' + d + 'ms ease, opacity ' + d + 'ms ease, visibility 0s linear ' + (open ? 0 : d) + 'ms;';
    }
    ['pro', 'ult', 'app', 'dot'].forEach(function (k) {
      var s = st.aud[k], t = st.thumb[k], f = st.fade[k], d = self._ms(130), dt = self._ms(260);
      out[k + 'Price'] = PR[k][s][0];
      out[k + 'Vat'] = PR[k][s][1];
      out[k + 'PriceStyle'] = 'opacity:' + (f ? 0 : 1) + ';transform:translateY(' + (f ? 6 : 0) + 'px);transition:opacity ' + d + 'ms ease, transform ' + d + 'ms ease;';
      out[k + 'Thumb'] = 'position:absolute;top:1px;left:1px;height:calc(100% - 2px);box-sizing:border-box;width:' + (t === 'p' ? 158 : 182) + 'px;'
        + 'transform:translateX(' + (t === 'p' ? 0 : 158) + 'px);border:1.5px solid #7F52FF;border-radius:21px;background:#ffffff;'
        + 'transition:transform ' + dt + 'ms ' + EASE + ', width ' + dt + 'ms ' + EASE + ';';
      out[k + 'IndP'] = t === 'p' ? 'true' : 'false';
      out[k + 'OrgP'] = t === 'c' ? 'true' : 'false';
      out[k + 'Ind'] = function () { self._aud(k, 'p'); };
      out[k + 'Org'] = function () { self._aud(k, 'c'); };
    });
    ['free', 'pro', 'ult', 'ent', 'app', 'dot'].forEach(function (k) {
      var open = st.incOpen === k, di = self._ms(300);
      out[k + 'IncOpen'] = open ? 'true' : 'false';
      out[k + 'IncPanel'] = panel(open, di);
      out[k + 'Caret'] = 'display:inline-flex;transform:rotate(' + (open ? 0 : 180) + 'deg);transition:transform ' + di + 'ms ease;';
      out[k + 'IncToggle'] = function () { self._inc(k); };
    });
    // Footnote return link goes back to whichever mention the reader clicked (defaults to the first one).
    var R = this._refs(), back = st.back || {};
    [1, 2].forEach(function (n) {
      var first = Object.keys(R).filter(function (r) { return R[r] === n; })[0];
      out['fn' + n + 'Back'] = back[n] || first;
    });
    Object.keys(R).forEach(function (r) {
      out['ref_' + r] = function () { var b = Object.assign({}, self.state.back || {}); b[R[r]] = r; self.setState({ back: b }); };
    });
    var C = this._counts();
    Object.keys(C).forEach(function (c) {
      var isOpen = st.cat === c, ulOn = st.ul === c && st.ulOn;
      out['c_' + c + 'Open'] = isOpen ? 'true' : 'false';
      out['c_' + c + 'Toggle'] = function () { self._onCat(c); };
      out['c_' + c + 'Ul'] = 'position:absolute;left:0;right:0;bottom:-2px;height:2px;border-radius:1px;background:#7F52FF;transform:scaleX(' + (ulOn ? 1 : 0) + ');transform-origin:left center;transition:transform ' + M + 'ms ease;';
      out['c_' + c + 'Panel'] = panel(isOpen, E);
      for (var j = 0; j < C[c]; j++) {
        (function (j) {
          var p = 'q_' + c + '_' + j;
          var open = isOpen && st.q === j, icon = isOpen && st.qIcon === j, bar = isOpen && st.bar === j && st.barOn;
          out[p + 'Open'] = open ? 'true' : 'false';
          out[p + 'Toggle'] = function () { self._onQ(c, j); };
          out[p + 'Panel'] = panel(open, E);
          out[p + 'Icon'] = 'display:inline-flex;align-items:center;justify-content:center;flex:0 0 22px;width:22px;height:22px;border-radius:50%;background:#7F52FF;transform:rotate(' + (icon ? 45 : 0) + 'deg);transition:transform ' + self._ms(200) + 'ms ease;';
          out[p + 'Bar'] = 'position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:2px;background:#7F52FF;transform:scaleY(' + (bar ? 1 : 0) + ');transform-origin:top center;transition:transform ' + M + 'ms ease;';
        })(j);
      }
    });
    out.openModels = function () { self._openTo('start', 3); };
    return out;
  }
}
