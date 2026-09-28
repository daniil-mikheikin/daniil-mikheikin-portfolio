/*
 * Bloom prototype — the whole state machine, copied verbatim from the design source.
 *
 * renderVals() returns a value for every {{hole}} in index.html: strings for text and
 * style fragments, functions for events. Nothing here touches the DOM directly except to
 * read geometry (Creative mode reads the real computed colour and font off the element
 * you click, rather than looking it up in a table).
 *
 * Values that came from the shipped extension and should not drift:
 *   popup            400 x 560
 *   presets          Classic 25/5, Deep work 50/10, Flow 90/20, Custom 35/7
 *   ambience         9 loops: rain, forest, white noise, piano, fireplace, storm,
 *                    snowstorm, birds, ocean
 *   themes           6, each a full token set (see design/tokens.json)
 *   motion           opacity .18s, transform .22s, background .18s, colour .18s
 *   press curve      0.26s cubic-bezier(.33, 1, .68, 1)
 */
const THEMES = [{"id": "classic", "label": "Classic", "tagline": "Quiet, neutral, out of the way", "dark": false, "c": {"bg": "#f3f4f7", "surface": "#ffffff", "surface2": "#f8f9fb", "text": "#2b2f36", "muted": "#6b7280", "faint": "#a0a6b0", "border": "#e7e9ee", "borderStrong": "#d8dbe2", "accent": "#5b6b8c", "accentSoft": "#eceff5", "accentInk": "#ffffff", "glow": "rgba(91,107,140,.30)"}}, {"id": "sakura", "label": "Sakura", "tagline": "Soft petals, pastel calm", "dark": false, "c": {"bg": "#fdf1f4", "surface": "#fffafb", "surface2": "#fdedf1", "text": "#5b3a45", "muted": "#a87d88", "faint": "#cda9b2", "border": "#f6dde4", "borderStrong": "#efc9d4", "accent": "#e07ea0", "accentSoft": "#fbe2ea", "accentInk": "#ffffff", "glow": "rgba(224,126,160,.34)"}}, {"id": "pumpkin", "label": "Pumpkin", "tagline": "Warm autumn, paper & spice", "dark": false, "c": {"bg": "#fbf1e7", "surface": "#fffaf3", "surface2": "#fbecdb", "text": "#4d3826", "muted": "#9c7a5c", "faint": "#c3a384", "border": "#f0dcc4", "borderStrong": "#e8c9a6", "accent": "#d2823f", "accentSoft": "#f7e4cf", "accentInk": "#ffffff", "glow": "rgba(210,130,63,.32)"}}, {"id": "ocean", "label": "Ocean", "tagline": "Bright shore, easy blue", "dark": false, "c": {"bg": "#ecf5fa", "surface": "#fbfdff", "surface2": "#e6f1f8", "text": "#2c4753", "muted": "#6c8794", "faint": "#9bb4c0", "border": "#d6e8f1", "borderStrong": "#bcdae8", "accent": "#3fa1c9", "accentSoft": "#dcecf4", "accentInk": "#ffffff", "glow": "rgba(63,161,201,.32)"}}, {"id": "midnight", "label": "Midnight", "tagline": "Classic dark, easy at night", "dark": true, "c": {"bg": "#15171c", "surface": "#1d2027", "surface2": "#22262f", "text": "#e7e9ee", "muted": "#9aa1ad", "faint": "#6a7280", "border": "#2b303a", "borderStrong": "#3a4150", "accent": "#6d83d6", "accentSoft": "#262c3b", "accentInk": "#ffffff", "glow": "rgba(109,131,214,.42)"}}, {"id": "gothic", "label": "Gothic", "tagline": "Dark-fantasy, blood & gold", "dark": true, "c": {"bg": "#130a0d", "surface": "#1e1014", "surface2": "#251519", "text": "#f0e6d8", "muted": "#8a6570", "faint": "#5a3d45", "border": "#2e1820", "borderStrong": "#4a2530", "accent": "#c52338", "accentSoft": "#2d0f16", "accentInk": "#ffffff", "glow": "rgba(197,35,56,.45)"}}];
const PRESETS = [{"id": "classic", "name": "Classic", "f": 25, "b": 5}, {"id": "deep", "name": "Deep work", "f": 50, "b": 10}, {"id": "flow", "name": "Flow", "f": 90, "b": 20}, {"id": "custom", "name": "Custom", "f": 35, "b": 7}];
const SOUNDS = ["Rain", "Forest", "White noise", "Piano", "Fireplace", "Storm", "Snowstorm", "Birds", "Ocean"];
const TINTS = [{"name": "None", "c": "#ffffff"}, {"name": "Creamy", "c": "#fdf8ec"}, {"name": "Sepia", "c": "#f4e8d5"}, {"name": "Blue", "c": "#e8f1fb"}, {"name": "Green", "c": "#e8f4ec"}, {"name": "Rose", "c": "#fbecf1"}, {"name": "Midnight", "c": "#1a1c22"}];
const FACES = [{"name": "Arial", "stack": "Arial, Helvetica, sans-serif"}, {"name": "Helvetica", "stack": "Helvetica, Arial, sans-serif"}, {"name": "Georgia", "stack": "Georgia, serif"}, {"name": "Garamond", "stack": "Garamond, Georgia, serif"}, {"name": "Times New Roman", "stack": "\"Times New Roman\", Times, serif"}, {"name": "OpenDyslexic", "stack": "Verdana, Geneva, sans-serif"}];
const TABS = [{"id": "focus", "name": "Focus"}, {"id": "tasks", "name": "Tasks"}, {"id": "notes", "name": "Notes"}, {"id": "sound", "name": "Sound"}, {"id": "tools", "name": "Tools"}];
const MODES = [{"id": "classic", "name": "Classic"}, {"id": "research", "name": "Research"}, {"id": "creative", "name": "Creative"}];
const TICK = [{"kind": "h1", "text": "Why your attention keeps leaving"}, {"kind": "meta", "text": "Field notes on focus, context switching and the browser as a workspace"}, {"kind": "p", "text": "Attention is not a switch you flip. It behaves more like a fire you have to build: kindling first, then small sticks, and only after several minutes will it hold a log without going out."}, {"kind": "p", "text": "This is why the cost of an interruption is never the interruption itself. Leaving a document to check how long is left on a timer takes two seconds. Finding your way back into the sentence you were part of the way through takes considerably longer, because the fire has to be rebuilt from kindling."}, {"kind": "h2", "text": "The browser is already the workspace"}, {"kind": "p", "text": "Most knowledge work now happens across a dozen tabs. The browser stopped being a way to visit documents and quietly became the desk those documents sit on \u2014 and yet the tools that help people concentrate still mostly live somewhere else, one alt-tab away."}, {"kind": "quote", "text": "The tool that keeps you in flow is the one you never have to leave the page to reach."}, {"kind": "p", "text": "A timer in a separate app is a timer you will forget. A note in a separate app is a thought you will lose on the way there. Distance is the whole problem, and distance is the only thing a browser extension is genuinely good at removing."}, {"kind": "p", "text": "What follows from that is a design constraint rather than a feature list: whatever helps you focus has to fit in the small rectangle that hangs off the toolbar, and it has to feel like part of the browser rather than a visitor inside it."}];

const SHOW = 'display: block;', HIDE = 'display: none;';

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      theme: 2, themeOpen: false, mode: 'classic', tab: 'focus',
      preset: 'classic', rounds: 1, running: false, paused: false, blooming: false,
      phase: 'focus', left: 25 * 60, round: 1,
      tasks: [], draft: '',
      notes: 'Reading list for Thursday:\n- context switching (Mark, 2008)\n- the cost of resumption lag',
      confirm: false,
      sound: 0, playing: false, vol: 60,
      opentabs: [
        { title: 'Why your attention keeps leaving', on: true, group: 0 },
        { title: 'Bloom — Chrome Web Store', on: false, group: 0 },
        { title: 'Resumption lag — research notes', on: true, group: 0 },
        { title: 'Inbox (3)', on: false, group: 0 }
      ],
      groupDraft: '', groupName: '', grouped: false,
      focusread: false, spot: 2, column: false, progress: false,
      face: 'Arial', weight: 'Regular', size: 19, lh: 1.6, ls: 0, ws: 0, col: 600, tint: 0,
      inspect: false, caps: [], hover: null, hx: 34, hy: 54,
      wx: 640, wy: 22, drag: null, scroll: 0
    };
    this._t = null;
  }

  componentDidMount() {
    this._t = setInterval(() => {
      const s = this.state;
      if (!s.running || s.paused || s.blooming) return;
      if (s.left > 1) { this.setState({ left: s.left - 1 }); return; }
      this._advance();
    }, 1000);
    const page = document.getElementById('bl-page');
    if (page) {
      this._onScroll = () => {
        const max = page.scrollHeight - page.clientHeight;
        this.setState({ scroll: max > 0 ? page.scrollTop / max : 0 });
      };
      page.addEventListener('scroll', this._onScroll);
    }
  }
  componentWillUnmount() {
    if (this._t) clearInterval(this._t);
    const page = document.getElementById('bl-page');
    if (page && this._onScroll) page.removeEventListener('scroll', this._onScroll);
  }

  _preset() { return PRESETS.filter((p) => p.id === this.state.preset)[0] || PRESETS[0]; }
  _phaseLen(phase) { const p = this._preset(); return (phase === 'focus' ? p.f : p.b) * 60; }
  _advance() {
    const s = this.state;
    if (s.phase === 'focus') { this.setState({ phase: 'break', left: this._phaseLen('break') }); return; }
    if (s.round >= s.rounds) { this.setState({ running: false, phase: 'focus', left: this._phaseLen('focus'), round: 1 }); return; }
    this.setState({ phase: 'focus', round: s.round + 1, left: this._phaseLen('focus') });
  }

  // ---- handlers
  _start() {
    const p = this._preset();
    this.setState({ blooming: true, running: true, paused: false, phase: 'focus', round: 1, left: p.f * 60, tab: 'focus' });
    setTimeout(() => this.setState({ blooming: false }), 1700);
  }
  _pickTab(id) { this.setState({ tab: id, themeOpen: false, mode: id === 'tools' ? this.state.mode : 'classic' }); }
  _pickMode(id) { this.setState({ mode: id, tab: 'tools', themeOpen: false }); }
  _addTask() {
    const t = (this.state.draft || '').trim();
    if (!t) return;
    this.setState({ tasks: this.state.tasks.concat([{ text: t, done: false }]), draft: '' });
  }
  _hex(rgb) {
    const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb || '');
    if (!m) return rgb || '#000000';
    return '#' + [1, 2, 3].map((i) => ('0' + Number(m[i]).toString(16)).slice(-2)).join('');
  }
  _capture(el) {
    if (!this.state.inspect || !el) return;
    const cs = getComputedStyle(el);
    const color = this._hex(cs.color);
    const family = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    const size = Math.round(parseFloat(cs.fontSize) * 100) / 100;
    const add = [
      { kind: 'Color', value: color, sw: color, glyph: '' },
      { kind: 'Font', value: family + ' ' + size + 'px / ' + cs.fontWeight, sw: '', glyph: 'T' }
    ];
    this.setState({ caps: add.concat(this.state.caps).slice(0, 12) });
  }

  renderVals() {
    const s = this.state, self = this;
    const T = THEMES[s.theme], c = T.c;
    const out = {};

    // ---------- theme variables
    out.rootVars = Object.keys(c).map((k) => '--' + k + ': ' + c[k]).join('; ') + ';';
    out.popupStyle = 'box-shadow: ' + (T.id === 'gothic'
      ? '0 30px 70px -20px rgba(0,0,0,.75)' : '0 26px 60px -24px rgba(30,30,40,.42)') + ';';
    out.gothFrame = T.id === 'gothic'
      ? 'display: block; border: 1px solid rgba(198,164,96,.55); box-shadow: inset 0 0 0 4px rgba(19,10,13,.9);' : HIDE;

    // ---------- header / chrome
    out.modeLabel = (MODES.filter((m) => m.id === s.mode)[0] || MODES[0]).name + ' mode';
    out.pn_chrome = s.themeOpen ? HIDE : SHOW;
    out.pn_tabbar = s.themeOpen ? HIDE : SHOW;
    out.openTheme = () => self.setState({ themeOpen: true });
    out.closeTheme = () => self.setState({ themeOpen: false });

    MODES.forEach((m) => {
      out['st_m_' + m.id] = s.mode === m.id ? 'background: var(--accent); color: var(--accentInk);' : '';
      out['pick_m_' + m.id] = () => self._pickMode(m.id);
    });
    TABS.forEach((t) => {
      out['st_t_' + t.id] = s.tab === t.id ? 'color: var(--accent);' : '';
      out['bar_t_' + t.id] = s.tab === t.id ? 'opacity: 1;' : 'opacity: 0;';
      out['pick_t_' + t.id] = () => self._pickTab(t.id);
    });

    // ---------- which panel shows
    const cls = !s.themeOpen && s.mode === 'classic';
    out.pn_theme = s.themeOpen ? SHOW : HIDE;
    out.pn_focus = cls && s.tab === 'focus' ? SHOW : HIDE;
    out.pn_tasks = cls && s.tab === 'tasks' ? SHOW : HIDE;
    out.pn_notes = cls && s.tab === 'notes' ? SHOW : HIDE;
    out.pn_sound = cls && s.tab === 'sound' ? SHOW : HIDE;
    out.pn_toolsClassic = cls && s.tab === 'tools' ? SHOW : HIDE;
    out.pn_research = !s.themeOpen && s.mode === 'research' && s.tab === 'tools' ? SHOW : HIDE;
    out.pn_creative = !s.themeOpen && s.mode === 'creative' && s.tab === 'tools' ? SHOW : HIDE;

    // ---------- focus / timer
    const pr = this._preset();
    out.presets = PRESETS.map((p) => ({
      name: p.name, sub: p.id === 'custom' ? 'set your own' : p.f + ' · ' + p.b,
      style: s.preset === p.id ? 'background: var(--accentSoft); border-color: var(--accent); color: var(--accent);' : '',
      pick: () => self.setState({ preset: p.id, left: (PRESETS.filter((q) => q.id === p.id)[0]).f * 60 })
    }));
    out.rounds = s.rounds;
    out.roundsUp = () => self.setState({ rounds: Math.min(8, s.rounds + 1) });
    out.roundsDown = () => self.setState({ rounds: Math.max(1, s.rounds - 1) });
    out.startLabel = pr.f + ' · ' + pr.b;
    out.start = () => self._start();
    out.pn_setup = s.running ? HIDE : SHOW;
    out.pn_run = s.running && !s.blooming ? SHOW : HIDE;
    out.pn_bloom = s.blooming ? SHOW : HIDE;

    const mm = Math.floor(s.left / 60), ss = s.left % 60;
    out.clock = mm + ':' + (ss < 10 ? '0' : '') + ss;
    out.phase = s.phase === 'focus' ? 'Focus' : 'Break';
    out.roundLabel = 'Round ' + s.round + ' of ' + s.rounds;
    const total = this._phaseLen(s.phase);
    out.ringOffset = Math.round(465 * (1 - s.left / total));
    out.runWord = s.paused ? 'Resume' : 'Pause';
    out.ic_pause = s.paused ? HIDE : 'display: flex;';
    out.ic_play = s.paused ? 'display: flex;' : HIDE;
    out.wg_pause = s.paused ? HIDE : 'display: flex;';
    out.wg_play = s.paused ? 'display: flex;' : HIDE;
    out.toggleRun = () => self.setState({ paused: !s.paused });
    out.skip = () => self._advance();
    out.stop = () => self.setState({ running: false, paused: false, phase: 'focus', round: 1, left: pr.f * 60 });

    // ---------- tasks
    out.draft = s.draft;
    out.setDraft = (e) => self.setState({ draft: e.target.value });
    out.taskKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); self._addTask(); } };
    out.addTask = () => self._addTask();
    const done = s.tasks.filter((t) => t.done).length;
    out.taskCount = done + ' / ' + s.tasks.length;
    out.doneCount = done;
    out.pn_tasksEmpty = s.tasks.length ? HIDE : SHOW;
    out.pn_clearDone = done ? 'display: block;' : HIDE;
    out.clearDone = () => self.setState({ tasks: s.tasks.filter((t) => !t.done) });
    out.tasks = s.tasks.map((t, i) => ({
      text: t.text,
      tick: t.done ? '✓' : '',
      box: t.done ? 'background: var(--accent); border-color: var(--accent); color: var(--accentInk); font-size: 12px; line-height: 1;' : '',
      label: t.done ? 'text-decoration: line-through; color: var(--muted);' : '',
      toggle: () => self.setState({ tasks: s.tasks.map((x, j) => (j === i ? { text: x.text, done: !x.done } : x)) })
    }));

    // ---------- notes
    out.notes = s.notes;
    out.setNotes = (e) => self.setState({ notes: e.target.value });
    out.wordCount = (s.notes.trim() ? s.notes.trim().split(/\s+/).length : 0) + ' words';
    out.askClear = () => self.setState({ confirm: true });
    out.cancelClear = () => self.setState({ confirm: false });
    out.doClear = () => self.setState({ notes: '', confirm: false });
    out.pn_modal = s.confirm ? 'display: flex;' : HIDE;

    // ---------- sound
    SOUNDS.forEach((n, i) => {
      out['st_s' + i] = s.sound === i && s.playing
        ? 'background: var(--accentSoft); border-color: var(--accent); color: var(--accent);' : '';
      out['pick_s' + i] = () => self.setState({ sound: i, playing: true });
    });
    out.soundName = SOUNDS[s.sound];
    out.sp_pause = s.playing ? 'display: flex;' : HIDE;
    out.sp_play = s.playing ? HIDE : 'display: flex;';
    out.togglePlay = () => self.setState({ playing: !s.playing });
    out.vol = s.vol;
    out.setVol = (e) => self.setState({ vol: Number(e.target.value) });

    // ---------- tab groups
    out.opentabs = s.opentabs.map((t, i) => ({
      title: t.title,
      tick: t.on ? '✓' : '',
      box: t.on ? 'background: var(--accent); border-color: var(--accent); color: var(--accentInk); font-size: 11px; line-height: 1;' : '',
      toggle: () => self.setState({ opentabs: s.opentabs.map((x, j) => (j === i ? { title: x.title, on: !x.on, group: x.group } : x)) })
    }));
    out.groupDraft = s.groupDraft;
    out.setGroup = (e) => self.setState({ groupDraft: e.target.value });
    out.makeGroup = () => {
      const n = (s.groupDraft || '').trim();
      if (!n) return;
      self.setState({ groupName: n, grouped: true, groupDraft: '' });
    };
    out.browsertabs = s.opentabs.map((t, i) => {
      const inGroup = s.grouped && t.on;
      return {
        title: (inGroup && i === s.opentabs.map((x) => x.on).indexOf(true) ? s.groupName + ' · ' : '') + t.title,
        style: i === 0
          ? 'background: #ffffff; color: #1f2124; font-weight: 600;'
          : 'background: rgba(255,255,255,.45); color: #4a4d52;',
        dot: inGroup ? 'background: ' + c.accent + ';' : 'background: #b9bec6;'
      };
    });

    // ---------- research
    const face = FACES.filter((f) => f.name === s.face)[0] || FACES[0];
    const tint = TINTS[s.tint];
    const darkTint = s.tint === 6;
    out.tg_focusread = () => self.setState({ focusread: !s.focusread });
    out.tg_column = () => self.setState({ column: !s.column });
    out.tg_progress = () => self.setState({ progress: !s.progress });
    out.tg_inspect = () => self.setState({ inspect: !s.inspect, hover: null });
    ['focusread', 'column', 'progress', 'inspect'].forEach((k) => {
      out['sw_' + k] = s[k] ? 'background: var(--accent);' : 'background: var(--borderStrong);';
      out['kn_' + k] = s[k] ? 'transform: translateX(16px);' : 'transform: none;';
    });
    out.face = s.face;
    out.setFace = (e) => self.setState({ face: e.target.value });
    out.weights = ['Light', 'Regular', 'Bold'].map((w) => ({
      name: w,
      style: s.weight === w ? 'background: var(--accent); color: var(--accentInk);' : '',
      pick: () => self.setState({ weight: w })
    }));
    const SL = { size: [14, 28, 1], lh: [1.2, 2.2, 0.1], ls: [0, 3, 0.1], ws: [0, 12, 0.5], col: [420, 820, 20] };
    Object.keys(SL).forEach((k) => {
      out['mn_' + k] = SL[k][0]; out['mx_' + k] = SL[k][1]; out['st_' + k] = SL[k][2];
      out['v_' + k] = s[k];
      out['set_' + k] = (e) => { const p = {}; p[k] = Number(e.target.value); self.setState(p); };
    });
    out.lb_size = s.size + 'px';
    out.lb_lh = s.lh.toFixed(1);
    out.lb_ls = s.ls.toFixed(1) + 'px';
    out.lb_ws = s.ws.toFixed(1) + 'px';
    out.lb_col = s.col + 'px';
    out.tints = TINTS.map((t, i) => ({
      name: t.name,
      sw: 'background: ' + t.c + ';' + (s.tint === i ? ' border-color: var(--accent); box-shadow: 0 0 0 2px var(--accentSoft);' : ''),
      lb: s.tint === i ? 'color: var(--accent); font-weight: 700;' : '',
      pick: () => self.setState({ tint: i })
    }));

    // ---------- the page
    const research = s.mode === 'research';
    out.pageStyle = 'background: ' + (research ? tint.c : '#ffffff') + '; transition: background .25s;';
    const wgt = s.weight === 'Light' ? 300 : s.weight === 'Bold' ? 700 : 400;
    out.proseStyle = [
      'max-width: ' + (research && s.column ? s.col + 'px' : '620px'),
      'margin: 0 auto', 'padding: ' + (research && s.column ? '56px 32px 72px' : '40px 32px 64px'),
      'color: ' + (darkTint && research ? '#e7e9ee' : '#22252b'),
      'font-family: ' + (research ? face.stack : 'Georgia, serif'),
      'font-size: ' + (research ? s.size : 16) + 'px',
      'font-weight: ' + (research ? wgt : 400),
      'line-height: ' + (research ? s.lh : 1.62),
      'letter-spacing: ' + (research ? s.ls : 0) + 'px',
      'word-spacing: ' + (research ? s.ws : 0) + 'px',
      'transition: max-width .3s, font-size .2s, line-height .2s, color .25s'
    ].join('; ') + ';';

    TICK.forEach((blk, i) => {
      const dim = research && s.focusread && s.spot !== i;
      out['a' + i] = 'opacity: ' + (dim ? 0.2 : 1) + '; transition: opacity .25s;'
        + (s.inspect && s.mode === 'creative' ? ' cursor: crosshair; outline: 1.5px dashed rgba(109,131,214,.55); outline-offset: 4px;' : '');
      out['pick' + i] = (e) => {
        if (self.state.mode === 'research' && self.state.focusread) { self.setState({ spot: i }); return; }
        if (self.state.mode === 'creative' && self.state.inspect) self._capture(e.currentTarget);
      };
      out['hov' + i] = (e) => {
        if (self.state.mode !== 'creative' || !self.state.inspect) return;
        const el = e.currentTarget, cs = getComputedStyle(el);
        self.setState({
          hover: i, hx: el.offsetLeft, hy: el.offsetTop + el.offsetHeight + 8,
          hcolor: self._hex(cs.color),
          hfont: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim() + ' ' + Math.round(parseFloat(cs.fontSize)) + 'px / ' + cs.fontWeight
        });
      };
    });

    // reading progress
    const pct = Math.max(0, Math.min(100, Math.round((s.scroll || 0) * 100)));
    out.progressWrap = research && s.progress ? 'display: block;' : HIDE;
    out.progressBar = 'width: ' + pct + '%;';
    const words = TICK.map((b) => b.text.split(/\s+/).length).reduce((a, b) => a + b, 0);
    out.readTime = Math.max(1, Math.round(words / 220)) + ' min read · ' + pct + '%';

    // floating widget
    out.widgetStyle = s.running && !s.blooming
      ? 'display: flex; left: ' + s.wx + 'px; top: ' + s.wy + 'px;' : HIDE;
    out.widgetDown = (e) => {
      e.preventDefault();
      self.setState({ drag: { dx: e.clientX - s.wx, dy: e.clientY - s.wy } });
    };
    out.pageMove = (e) => {
      const d = self.state.drag;
      if (!d) return;
      const host = document.getElementById('bl-page');
      const r = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
      self.setState({
        wx: Math.max(8, Math.min(1200 - 150, e.clientX - d.dx)),
        wy: Math.max(8, Math.min(560, e.clientY - d.dy))
      });
    };
    out.pageUp = () => { if (self.state.drag) self.setState({ drag: null }); };

    // creative captures + tooltip
    out.caps = s.caps.map((cp) => ({
      kind: cp.kind, value: cp.value, glyph: cp.glyph || '',
      sw: cp.sw ? 'background: ' + cp.sw + ';'
        : 'background: var(--accentSoft); color: var(--accent); font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center;'
    }));
    out.pn_capsEmpty = s.caps.length ? HIDE : SHOW;
    out.pn_clearCaps = s.caps.length ? 'display: block;' : HIDE;
    out.clearCaps = () => self.setState({ caps: [] });
    const hv = s.mode === 'creative' && s.inspect && s.hover != null ? s.hover : null;
    out.tipStyle = hv == null ? HIDE : 'display: flex; left: ' + (s.hx || 34) + 'px; top: ' + (s.hy || 54) + 'px;';
    out.tipColor = s.hcolor || '';
    out.tipSw = s.hcolor ? 'background: ' + s.hcolor + ';' : '';
    out.tipFont = s.hfont || '';

    // ---------- theme list
    out.themelist = THEMES.map((t, i) => ({
      label: t.label, tagline: t.tagline,
      s1: 'background: ' + t.c.bg + '; border: 1px solid ' + t.c.border + ';',
      s2: 'background: ' + t.c.accent + ';',
      s3: 'background: ' + t.c.text + ';',
      name: 'color: ' + (s.theme === i ? c.text : c.text) + ';',
      tag: 'color: ' + c.muted + ';',
      style: s.theme === i ? 'background: var(--accentSoft); border-color: var(--accent);' : '',
      on: s.theme === i
        ? 'display: inline-block; background: var(--accent); color: var(--accentInk);'
        : HIDE,
      pick: () => self.setState({ theme: i })
    }));

    return out;
  }
}
