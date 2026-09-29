/*
 * CollabLearn workspace — the whole state machine, copied verbatim from the design source.
 *
 * renderVals() returns a value for every {{hole}} in index.html: strings for text and style
 * fragments, functions for events. FLOWS at the top is the micro-interaction map turned into
 * data — each step carries its own sentence, the state the workspace should be in, and which
 * control to ring. The three flows and their wording come straight from the case study.
 *
 * Values taken from the high-fidelity screens, which should not drift:
 *   chrome purple    #734686      light lilac   #F5DBFF
 *   canvas           #F2F2F2 with a 22px dot grid
 *   share button     #1668C4      chat panel    #4A4A4A
 *   participants     Mathias K. #E08A3C · Sophie R. #E0557B · qwerty30 #3FA05A
 */
const MEMBERS = [{"name": "Mathias K.", "color": "#E08A3C", "role": "Researcher"}, {"name": "Sophie R.", "color": "#E0557B", "role": "Designer"}, {"name": "qwerty30", "color": "#3FA05A", "role": "Editor"}];
const FILES = [{"name": "Interview transcript 3", "kind": "DOC", "topic": "Research", "color": "#4C7BD9"}, {"name": "Survey results", "kind": "CSV", "topic": "Research", "color": "#3FA05A"}, {"name": "Moodboard v2", "kind": "PNG", "topic": "Design", "color": "#E0557B"}, {"name": "Reading list", "kind": "PDF", "topic": "Research", "color": "#D9534C"}, {"name": "Wireframes", "kind": "FIG", "topic": "Design", "color": "#734686"}, {"name": "Brief", "kind": "DOC", "topic": "Admin", "color": "#4C7BD9"}];

const SHOW = 'display: block;', HIDE = 'display: none;', FLEX = 'display: flex;';
const HL = 'outline: 3px solid ' + '#E5AEFB' + '; outline-offset: 3px; border-radius: 10px;';

const FLOWS = {
  chat: {
    label: 'Chat',
    steps: [
      { t: 'Every person has a chat icon in the upper-left corner.', s: { panel: null }, hl: 'chat' },
      { t: 'The user clicks the icon, and the chat panel opens.', s: { panel: 'chat' }, hl: null },
      { t: 'The user writes a message.', s: { panel: 'chat', chatDraft: 'Sharing the survey results now' }, hl: null },
      { t: 'They click Send. The message appears in the panel, under their name.', s: { panel: 'chat' }, hl: null, act: 'send' },
      { t: 'It also appears above their cursor in the shared workspace, in a speech bubble.', s: { panel: null }, hl: null }
    ]
  },
  roles: {
    label: 'Roles & tasks',
    steps: [
      { t: 'The user clicks Members on the right of the interface.', s: { panel: null }, hl: 'members' },
      { t: 'A list of every project participant opens.', s: { panel: 'members', picked: null }, hl: null },
      { t: 'They click the person they want to give a task to; an action bar appears beside them.', s: { panel: 'members', picked: 1 }, hl: null },
      { t: 'Clicking the task icon opens the Roles & Task Assignment window.', s: { panel: 'members', picked: 1, modal: true }, hl: null },
      { t: 'They set a role, tick the tasks, and click Save & close.', s: { panel: 'members', picked: 1, modal: true }, hl: null, act: 'save' },
      { t: 'The member receives the tasks in their task panel.', s: { panel: 'tasks', modal: false }, hl: null }
    ]
  },
  mytasks: {
    label: 'My tasks',
    steps: [
      { t: 'To reach your tasks, click the Tasks tab below Participants.', s: { panel: null }, hl: 'tasks' },
      { t: 'A panel with your personal tasks appears.', s: { panel: 'tasks' }, hl: null },
      { t: 'Tick the square next to a task to track it.', s: { panel: 'tasks' }, hl: null, act: 'tick' },
      { t: 'On completion, everyone sees that the task is done.', s: { panel: 'tasks' }, hl: null, act: 'toast' }
    ]
  }
};

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      mode: 'classic', panel: null, modal: false, tool: 'move',
      chat: [
        { who: 'Mathias K.', color: '#E08A3C', text: 'Hi! How is it going?' },
        { who: 'qwerty30', color: '#3FA05A', text: 'It’s okaaaaay :)' },
        { who: 'Sophie R.', color: '#E0557B', text: 'I am completing tasks from my to-do list' }
      ],
      chatDraft: '', bubble: null,
      members: MEMBERS.map(function (m) { return { name: m.name, color: m.color, role: m.role }; }),
      picked: null, roleDraft: 'Designer',
      assignable: [
        { text: 'Make a dark mode toggle switch', on: true },
        { text: 'Design a microphone icon', on: true },
        { text: 'Design a loading spinner', on: false }
      ],
      myTasks: [
        { text: 'Make a dark mode toggle switch', done: false },
        { text: 'Design a microphone icon', done: false },
        { text: 'Design a loading spinner', done: false }
      ],
      notes: [], noteSeq: 0,
      fileSort: 'topic', findDraft: '',
      toast: null, flow: null, step: 0, hl: null
    };
    this._toastT = null;
  }

  componentWillUnmount() { if (this._toastT) clearTimeout(this._toastT); }

  _toast(msg) {
    const self = this;
    this.setState({ toast: msg });
    if (this._toastT) clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { self.setState({ toast: null }); }, 2600);
  }

  _send() {
    const t = (this.state.chatDraft || '').trim();
    if (!t) return;
    this.setState({
      chat: this.state.chat.concat([{ who: 'Daniil M.', color: '#734686', text: t }]),
      chatDraft: '', bubble: t
    });
  }

  _saveRoles() {
    const s = this.state;
    const picked = s.picked == null ? 1 : s.picked;
    const chosen = s.assignable.filter(function (a) { return a.on; });
    const members = s.members.map(function (m, i) {
      return i === picked ? { name: m.name, color: m.color, role: s.roleDraft } : m;
    });
    this.setState({
      members: members, modal: false, panel: 'tasks',
      myTasks: chosen.map(function (c) { return { text: c.text, done: false }; })
    });
    this._toast(s.members[picked].name + ' was given ' + chosen.length + ' task' + (chosen.length === 1 ? '' : 's'));
  }

  // ---- flow player
  _apply(flowId, i) {
    const f = FLOWS[flowId], st = f.steps[i];
    const patch = Object.assign({ flow: flowId, step: i, hl: st.hl || null, modal: false }, st.s || {});
    this.setState(patch);
    const self = this;
    if (st.act === 'send') {
      setTimeout(function () { self.setState({ chatDraft: 'Sharing the survey results now' }); self._send(); }, 260);
    } else if (st.act === 'save') {
      setTimeout(function () { self._saveRoles(); self.setState({ flow: flowId, step: i }); }, 400);
    } else if (st.act === 'tick') {
      setTimeout(function () {
        self.setState({ myTasks: self.state.myTasks.map(function (t, j) { return j === 0 ? { text: t.text, done: true } : t; }) });
      }, 300);
    } else if (st.act === 'toast') {
      setTimeout(function () { self._toast('Sophie R. has completed “Make a dark mode toggle switch”'); }, 200);
    }
  }

  renderVals() {
    const s = this.state, self = this;
    const out = {};
    const writer = s.mode === 'writer';

    // ---- top bar + highlights
    out.goHome = function () { self.setState({ panel: null, modal: false }); };
    out.openSettings = function () { self.setState({ panel: s.panel === 'settings' ? null : 'settings', modal: false }); };
    out.openChat = function () { self.setState({ panel: s.panel === 'chat' ? null : 'chat', modal: false }); };
    out.openMembers = function () { self.setState({ panel: s.panel === 'members' ? null : 'members', modal: false, picked: null }); };
    out.openTasks = function () { self.setState({ panel: s.panel === 'tasks' ? null : 'tasks', modal: false }); };
    out.openFiles = function () { self.setState({ panel: s.panel === 'files' ? null : 'files', modal: false }); };
    out.closePanel = function () { self.setState({ panel: null, modal: false }); };
    out.noop = function () {};
    out.undo = function () { self.setState({ notes: s.notes.slice(0, -1) }); };

    ['chat', 'settings', 'members', 'tasks', 'files', 'find', 'rail'].forEach(function (k) {
      out['hl_' + k] = s.hl === k ? HL : '';
    });

    // ---- tools
    ['cite', 'shape', 'frame', 'note', 'move', 'doc', 'draw', 'type', 'comment'].forEach(function (k) {
      out['st_tool_' + k] = s.tool === k ? 'background: ' + '#F5DBFF' + '; color: ' + '#734686' + ';' : '';
      out['tool_' + k] = function () { self.setState({ tool: k }); };
    });

    // ---- canvas
    out.canvasClick = function (e) {
      if (s.tool !== 'note' && s.tool !== 'frame' && s.tool !== 'cite') return;
      const host = document.getElementById('cl-canvas');
      if (!host || !e.target || e.target.closest('button, input, select, [data-panel]')) return;
      const r = host.getBoundingClientRect();
      const x = Math.max(8, Math.min(r.width - 140, e.clientX - r.left - 62));
      const y = Math.max(8, Math.min(r.height - 120, e.clientY - r.top - 40));
      const kind = s.tool;
      const text = kind === 'note' ? 'New note' : kind === 'frame' ? 'Frame ' + (s.noteSeq + 1) : 'Smith, J. (2024)';
      const style = kind === 'note'
        ? 'background: #F8E265; border: 1px solid #E3C93F; left: ' + x + 'px; top: ' + y + 'px;'
        : kind === 'frame'
          ? 'background: rgba(255,255,255,.6); border: 1.5px dashed #9AA8B4; left: ' + x + 'px; top: ' + y + 'px;'
          : 'background: #ffffff; border: 1px solid #E2E2E2; font-style: italic; left: ' + x + 'px; top: ' + y + 'px;';
      self.setState({ notes: s.notes.concat([{ text: text, style: style }]), noteSeq: s.noteSeq + 1, tool: 'move' });
    };
    out.notes = s.notes.map(function (n) { return { text: n.text, style: n.style }; });

    out.pn_writer = writer ? SHOW : HIDE;
    out.pn_doc = writer ? SHOW : HIDE;
    out.pn_bubble = s.bubble ? SHOW : HIDE;
    out.pn_cursor = s.bubble ? FLEX : HIDE;
    out.bubbleText = s.bubble || '';

    // ---- find bar
    out.findDraft = s.findDraft;
    out.setFind = function (e) { self.setState({ findDraft: e.target.value }); };

    // ---- panels
    out.pn_chat = s.panel === 'chat' ? SHOW : HIDE;
    out.pn_members = s.panel === 'members' ? SHOW : HIDE;
    out.pn_tasks = s.panel === 'tasks' ? SHOW : HIDE;
    out.pn_files = s.panel === 'files' ? SHOW : HIDE;
    out.pn_settings = s.panel === 'settings' ? SHOW : HIDE;
    out.pn_roles = s.modal ? FLEX : HIDE;
    out.pn_toast = s.toast ? SHOW : HIDE;
    out.toast = s.toast || '';

    // ---- chat
    out.chat = s.chat.map(function (m) { return { who: m.who, text: m.text, color: 'color: ' + m.color + ';' }; });
    out.chatDraft = s.chatDraft;
    out.setChat = function (e) { self.setState({ chatDraft: e.target.value }); };
    out.chatKey = function (e) { if (e.key === 'Enter') { e.preventDefault(); self._send(); } };
    out.sendChat = function () { self._send(); };

    // ---- members
    out.members = s.members.map(function (m, i) {
      return {
        name: m.name, role: m.role,
        avatar: 'background: ' + m.color + ';',
        row: s.picked === i ? 'background: #F5DBFF;' : '',
        actions: s.picked === i ? FLEX : HIDE,
        pick: function () { self.setState({ picked: s.picked === i ? null : i, roleDraft: m.role }); },
        assign: function () { self.setState({ modal: true, picked: i, roleDraft: m.role }); }
      };
    });

    // ---- roles modal
    const pi = s.picked == null ? 1 : s.picked;
    out.roleName = s.members[pi].name;
    out.roleAvatar = 'background: ' + s.members[pi].color + ';';
    out.roleDraft = s.roleDraft;
    out.setRole = function (e) { self.setState({ roleDraft: e.target.value }); };
    out.assignable = s.assignable.map(function (a, i) {
      return {
        text: a.text, tick: a.on ? '✓' : '',
        box: a.on ? 'background: #734686; border-color: #734686; color: #fff; font-size: 10px; line-height: 1;' : '',
        toggle: function () {
          self.setState({ assignable: s.assignable.map(function (x, j) { return j === i ? { text: x.text, on: !x.on } : x; }) });
        }
      };
    });
    out.cancelRoles = function () { self.setState({ modal: false }); };
    out.saveRoles = function () { self._saveRoles(); };

    // ---- my tasks
    out.myTasks = s.myTasks.map(function (t, i) {
      return {
        text: t.text, tick: t.done ? '✓' : '',
        box: t.done ? 'background: #734686; border-color: #734686; color: #fff; font-size: 11px; line-height: 1;' : '',
        label: t.done ? 'text-decoration: line-through; color: #6B7783;' : '',
        toggle: function () {
          const next = s.myTasks.map(function (x, j) { return j === i ? { text: x.text, done: !x.done } : x; });
          self.setState({ myTasks: next });
          if (!t.done) self._toast('Sophie R. has completed “' + t.text + '”');
        }
      };
    });

    // ---- files
    out.st_topic = s.fileSort === 'topic' ? 'background: #F5DBFF; border-color: #E5AEFB; color: #734686;' : '';
    out.st_format = s.fileSort === 'format' ? 'background: #F5DBFF; border-color: #E5AEFB; color: #734686;' : '';
    out.sortTopic = function () { self.setState({ fileSort: 'topic' }); };
    out.sortFormat = function () { self.setState({ fileSort: 'format' }); };
    const key = s.fileSort === 'topic' ? 'topic' : 'kind';
    const names = [];
    FILES.forEach(function (f) { if (names.indexOf(f[key]) < 0) names.push(f[key]); });
    out.fileGroups = names.map(function (n) {
      return {
        name: n,
        items: FILES.filter(function (f) { return f[key] === n; }).map(function (f) {
          return { name: f.name, kind: f.kind, badge: 'background: ' + f.color + ';' };
        })
      };
    });

    // ---- modes
    ['classic', 'creative', 'writer'].forEach(function (m) {
      out['st_mode_' + m] = s.mode === m ? 'background: #F5DBFF; border-color: #734686;' : '';
      out['mode_' + m] = function () { self.setState({ mode: m, panel: null }); };
    });

    // ---- flow player
    ['chat', 'roles', 'mytasks'].forEach(function (f) {
      out['st_flow_' + f] = s.flow === f ? 'background: #734686; border-color: #734686; color: #fff;' : '';
      out['flow_' + f] = function () { self._apply(f, 0); };
    });
    const active = s.flow ? FLOWS[s.flow] : null;
    out.pn_flowtext = active ? FLEX : 'visibility: hidden;';
    out.pn_flowctl = active ? FLEX : HIDE;
    out.flowText = active ? active.steps[s.step].t : '';
    out.flowCount = active ? (s.step + 1) + ' / ' + active.steps.length : '';
    out.flowNextWord = active && s.step === active.steps.length - 1 ? 'Done' : 'Next';
    out.flowPrev = function () { if (active && s.step > 0) self._apply(s.flow, s.step - 1); };
    out.flowNext = function () {
      if (!active) return;
      if (s.step < active.steps.length - 1) self._apply(s.flow, s.step + 1);
      else self.setState({ flow: null, step: 0, hl: null });
    };
    out.flowStop = function () { self.setState({ flow: null, step: 0, hl: null, panel: null, modal: false }); };

    return out;
  }
}
