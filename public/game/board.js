'use strict';
/* ============ leaderboard ============
   One document per fighter at scores/<their id>, holding their best run. Everyone admitted to the page reads the board, each
   fighter writes only their own row, and the artifact's owner may remove one (rules are declared at publish). Rows are other
   people's input: every field is clamped here and goes into the page with textContent, never as markup. */
const BOARD = (() => {
  const TOP = 100, NAME_MAX = 14, KEY = 'tenarms.callsign', NS = 'http://www.w3.org/2000/svg';
  const S = {
    db: null, uid: null, owner: false, write: null,           // write: true, false, or null when the platform has not said
    state: 'wait', slow: false, ready: false,                 // wait → live | off (no store in this view) | dead (listener ended)
    rows: [], mine: null, name: '', dirty: false,
    last: null, unsaved: null, busy: false, fail: '', retried: false,
    liveRank: 0, liveKey: '', popT: -9, formOn: false,
  };
  const el = {};
  const fmt = n => n.toLocaleString('en-US');
  const int = (v, lo, hi) => { v = Math.floor(+v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; };
  const tidy = v => [...String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('').trim();
  const suggest = () => ['Ronin', 'Kaze', 'Vesper', 'Onyx', 'Mako', 'Sable', 'Wren', 'Ember', 'Rook', 'Nyx'][(Math.random() * 10) | 0] + '-' + (10 + ((Math.random() * 90) | 0));
  function clean(d) {
    const x = d && d.exists && d.data(); if (!x) return null;
    const score = int(x.score, 0, 99999999); if (!score) return null;
    return { id: d.id, name: tidy(x.name) || 'Nameless', score, wave: int(x.wave, 1, 999), kills: int(x.kills, 0, 99999), combo: int(x.combo, 0, 9999), secs: int(x.secs, 0, 359999), weapon: WEAPONS.some(w => w.id === x.weapon) ? x.weapon : '' };
  }
  function setName(n) { S.name = n; try { localStorage.setItem(KEY, n); } catch (_) {} }

  /* ---------- the store ---------- */
  let timer = 0, gen = 0, stopTop = null, stopMine = null, resub = false;
  function listen() {
    const g = ++gen; S.slow = false; clearTimeout(timer);
    timer = setTimeout(() => { if (g === gen) { S.slow = true; render(); } }, 10000);
    try {
      stopTop = S.db.collection('scores').orderBy('score', 'desc').limit(TOP).onSnapshot(snap => {
        if (g !== gen) return;
        S.rows = snap.docs.map(clean).filter(Boolean).sort((a, b) => b.score - a.score); S.state = 'live';
        if (!snap.metadata || !snap.metadata.fromCache) { clearTimeout(timer); S.slow = false; resub = false; }
        render();
      }, e => lost(g, e));
      if (S.uid) stopMine = S.db.doc('scores/' + S.uid).onSnapshot(snap => {
        if (g !== gen) return;
        S.mine = clean(snap);
        if (S.mine) { if (!S.dirty) setName(S.mine.name); if (S.mine.score > G.best) G.best = S.mine.score; }
        if (!S.ready && (!snap.metadata || !snap.metadata.fromCache)) { S.ready = true; sync(); }   // the stored best is known: a run that ended while connecting can go up now
        render();
      }, e => lost(g, e));
    } catch (_) { lost(g, null); }
  }
  function lost(g, e) {
    if (g !== gen) return; gen++; clearTimeout(timer); S.ready = false;
    try { if (stopTop) stopTop(); if (stopMine) stopMine(); } catch (_) {} stopTop = stopMine = null;
    const code = e && e.code;
    if (code === 'unavailable' && !resub) { resub = true; S.slow = true; setTimeout(listen, 4000); }
    else S.state = code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed' || !e ? 'off' : 'dead';
    render();
  }
  /* one write at a time, and only for something the player just did: a finished run that beats the stored one, or a new name */
  function sync() {
    if (!S.ready || !S.uid || S.write === false || S.busy || !S.name) return;
    const u = S.unsaved, m = S.mine, doc = S.db.doc('scores/' + S.uid); let job = null;
    if (u && (!m || u.score > m.score)) {
      const body = { name: S.name, score: u.score, wave: u.wave, kills: u.kills, combo: u.combo, secs: u.secs, weapon: u.weapon, at: new Date().toISOString(), v: 1 };
      job = doc.set(body).then(() => { S.mine = clean({ id: S.uid, exists: true, data: () => body }); });
    } else if (m && S.dirty && m.name !== S.name) {
      const name = S.name; job = doc.update({ name }).then(() => { if (S.mine) S.mine = Object.assign({}, S.mine, { name }); });
    }
    S.unsaved = null;
    if (!job) { S.dirty = false; return; }
    S.busy = true;
    job.then(() => { S.write = true; S.dirty = false; S.fail = ''; S.busy = false; render(); sync(); }, e => { S.busy = false; failed(e, u); render(); });
  }
  function failed(e, u) {
    const code = e && e.code;
    if (code === 'unavailable' && !S.retried) {
      S.retried = true; setTimeout(() => { if (u && (!S.unsaved || u.score > S.unsaved.score)) S.unsaved = u; sync(); render(); }, 700 + Math.random() * 900); return;
    }
    S.dirty = false;
    if ((code === 'invalid_argument' || code === 'transform_error') && S.write !== true) { S.write = false; return; }   // this viewer may watch, not write
    if (code === 'revoked' || code === 'not_granted') S.write = false;
    S.fail = code === 'quota_exceeded' ? 'The leaderboard is full, so this run was not saved.' : 'This run could not be saved to the leaderboard.';
  }

  /* ---------- rows ---------- */
  const cell = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  function glyph(id) {
    const w = WEAPONS.find(w => w.id === id), s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (w) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', w.icon); s.appendChild(p); s.style.color = w.css; if (w.iw) s.style.strokeWidth = w.iw; }
    return s;
  }
  function removeBtn(r) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'bdel'; b.textContent = '✕'; b.title = 'Remove this row'; b.setAttribute('aria-label', 'Remove ' + r.name + ' from the board');
    b.addEventListener('click', () => {
      if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'REMOVE?'; setTimeout(() => { b.classList.remove('arm'); b.textContent = '✕'; }, 3000); return; }
      b.disabled = true; S.db.doc('scores/' + r.id).delete().catch(() => { S.fail = 'That row could not be removed.'; render(); });
    });
    return b;
  }
  function row(r, rank, kind) {
    const me = !!r.me || (!!S.uid && r.id === S.uid), li = document.createElement('li');
    li.className = 'brow' + (me ? ' me' : '') + (r.ghost ? ' ghost' : '') + (rank <= 3 && !r.ghost ? ' top' + rank : '');
    const name = cell('bname', r.name); if (me) name.appendChild(cell('you', r.ghost ? 'THIS RUN' : 'YOU'));
    li.append(cell('brank', rank > TOP ? TOP + '+' : rank), glyph(r.weapon), name);
    if (kind !== 'card') li.append(cell('bdim bwave', kind === 'mini' ? 'W' + r.wave : r.wave));
    if (kind === 'full') li.append(cell('bdim bkills', r.kills), cell('bdim bcombo', r.combo));
    li.append(cell('bsc', fmt(r.score)));
    if (kind === 'full' && S.owner) li.append(removeBtn(r));
    return li;
  }
  function fill(ol, rows, first, kind) { ol.textContent = ''; rows.forEach((r, i) => ol.appendChild(row(r, first + i + 1, kind))); }
  function standing() {   // where the stored best sits; TOP + 1 means somewhere below the rows on screen
    if (!S.mine) return 0; const i = S.rows.findIndex(r => r.id === S.uid); if (i >= 0) return i + 1;
    const above = S.rows.filter(r => r.score > S.mine.score).length; return above >= TOP ? TOP + 1 : above + 1;
  }
  function note() {
    if (S.state === 'off') return 'The leaderboard is not available in this view. Your best stays on this device.';
    if (S.state === 'dead') return 'Lost the connection to the leaderboard.';
    if (S.state === 'wait') return S.slow ? 'The leaderboard cannot be reached yet.' : 'Connecting to the leaderboard…';
    if (S.fail) return S.fail;
    if (S.slow) return 'Showing saved standings. They may be out of date.';
    if (S.write === false) return 'You are watching as a guest: runs from this link are not recorded.';
    return '';
  }

  /* ---------- panels ---------- */
  function render() {
    if (!el.card) return;
    const n = S.rows.length, msg = note(), on = S.state === 'live', empty = 'No runs yet. Be the first on the board.';
    el.card.hidden = S.state === 'off' || (S.state === 'dead' && !n);
    fill(el.topList, S.rows.slice(0, 5), 0, 'card'); el.dot.classList.toggle('on', on && !S.slow);
    el.topNote.textContent = n ? '' : on && !S.slow ? empty : msg; el.topNote.hidden = !el.topNote.textContent;

    el.board.classList.toggle('mod', S.owner); fill(el.rankList, S.rows, 0, 'full');
    el.rankNote.textContent = msg || (n ? (n >= TOP ? 'Top ' + TOP : n + (n === 1 ? ' fighter' : ' fighters')) + ' · updates live' : empty);
    const st = standing(); el.rankYou.hidden = !st;
    if (st) el.rankYou.textContent = 'YOUR BEST  ' + fmt(S.mine.score) + '   ·   RANK ' + (st > TOP ? TOP + '+' : '#' + st);
    el.nameForm.hidden = !(on && S.uid && S.write !== false);
    if (!el.nameForm.hidden && document.activeElement !== el.nameIn) el.nameIn.value = S.name;
    el.nameGo.disabled = S.busy;
    over(); live();
  }
  function over() {
    const run = S.last; if (!run || el.over.hidden) return;
    if (S.state !== 'live') { el.overBoard.hidden = el.overForm.hidden = true; S.formOn = false; el.overNote.textContent = S.state === 'wait' ? note() : ''; return; }
    const stored = S.mine, isBest = !stored || run.score >= stored.score, show = isBest ? run : stored;
    const canSign = !!S.uid && S.write !== false, onBoard = !!stored || (canSign && !!S.name && run.score > 0);
    const others = S.rows.filter(r => r.id !== S.uid);
    const me = { id: S.uid || '', me: true, ghost: !onBoard, name: S.name || (stored && stored.name) || 'Unsigned', score: show.score, wave: show.wave, kills: show.kills, combo: show.combo, weapon: show.weapon };
    let pos = 0; while (pos < others.length && others[pos].score >= me.score) pos++;
    const list = others.slice(); list.splice(pos, 0, me);
    const win = innerHeight < 640 ? 3 : 5, start = Math.max(0, Math.min(pos - (win >> 1), list.length - win));
    fill(el.overList, list.slice(start, start + win), start, 'mini'); el.overBoard.hidden = false;
    const rank = pos >= TOP ? TOP + '+' : '#' + (pos + 1);
    el.overPlace.textContent = !run.score && !stored ? 'NO SCORE THIS RUN' : !onBoard ? 'THIS RUN WOULD PLACE ' + rank : isBest ? 'RANK ' + rank + (others.length >= TOP ? '' : ' OF ' + list.length) : 'YOUR BEST ' + fmt(stored.score) + ' HOLDS RANK ' + rank;
    const ask = canSign && !S.name && run.score > 0; el.overForm.hidden = !ask;
    if (ask && !S.formOn) { el.overIn.value = suggest(); if (matchMedia('(pointer: fine)').matches) { el.overIn.focus(); el.overIn.select(); } }
    S.formOn = ask;
    el.overNote.textContent = S.busy ? 'Saving your run…' : note();
  }
  /* in a fight: who is next to pass, and a call-out each time the running score climbs a place */
  function live() {
    if (!el.rival) return;
    const play = G.state === 'play', others = play && S.state === 'live' ? S.rows.filter(r => r.id !== S.uid) : [];
    if (!others.length) { el.rival.hidden = true; S.liveKey = ''; if (!play) S.liveRank = 0; return; }
    let k = 0; while (k < others.length && others[k].score > G.score) k++;
    const next = k ? others[k - 1] : null, key = next ? next.id + ':' + next.score + ':' + k : 'top';
    if (key !== S.liveKey) {
      S.liveKey = key; el.rivalL.textContent = next ? 'NEXT #' + k : 'RANK'; el.rivalT.textContent = next ? next.name + '  ' + fmt(next.score) : '#1 ON THE BOARD'; el.rival.classList.toggle('top', !next);
    }
    el.rival.hidden = false;
    const rank = k + 1;
    if (S.liveRank && rank < S.liveRank && rank <= 10 && !player.dead && G.real - S.popT > 1.5) { S.popT = G.real; HUD.num({ x: player.pos.x, y: 2.7, z: player.pos.z }, rank === 1 ? 'TOP OF THE BOARD' : 'RANK #' + rank, 'note'); }
    S.liveRank = rank;
  }

  /* ---------- flow ---------- */
  function finish(run, show) {
    if (show) S.last = run;
    if (run.score > 0 && (!S.unsaved || run.score > S.unsaved.score)) S.unsaved = run;
    S.fail = ''; S.retried = false; sync(); render();
  }
  function start() { S.liveRank = 0; S.liveKey = ''; S.formOn = false; close(); live(); }
  function sign(inp) {
    const n = tidy(inp ? inp.value : S.name);
    if (!n) { if (inp) inp.focus(); return; }
    S.dirty = true;
    setName(n);
    S.fail = '';
    S.retried = false;
    if (inp) inp.blur();
    sync();
    render();
  }
  function open() {
    el.ranks.hidden = false;
    el.ranks.style.display = 'flex';
    render();
    const mine = el.rankList.querySelector('.me');
    if (mine) mine.scrollIntoView({ block: 'center' });
    el.back.focus();
  }
  function close() {
    el.ranks.hidden = true;
    el.ranks.style.display = 'none';
  }

  async function init() {
    Object.assign(el, {
      card: $('topCard'), topList: $('topList'), topNote: $('topNote'), dot: $('topDot'), ranks: $('ranks'), board: $('rankBoard'), rankList: $('rankList'), rankNote: $('rankNote'), rankYou: $('rankYou'),
      nameForm: $('nameForm'), nameIn: $('nameIn'), nameGo: $('nameGo'), back: $('bRanksBack'), over: $('over'), overBoard: $('overBoard'), overPlace: $('overPlace'), overList: $('overList'),
      overForm: $('overForm'), overIn: $('overIn'), overNote: $('overNote'), rival: $('rival'), rivalL: $('rivalL'), rivalT: $('rivalT'),
    });
    el.ranks.style.display = 'none';
    for (const id of ['bRanks', 'bTop', 'bRanksOver', 'bRanksPause']) {
      const btn = $(id);
      if (btn) {
        btn.addEventListener('click', e => { e.preventDefault(); open(); });
      }
    }
    el.back.addEventListener('click', e => { e.preventDefault(); close(); });
    el.back.addEventListener('touchstart', e => { e.preventDefault(); close(); }, { passive: false });
    addEventListener('keydown', e => { if (e.code === 'Escape' && !el.ranks.hidden) close(); });
    el.nameForm.addEventListener('submit', e => { e.preventDefault(); sign(el.nameIn); });
    if (el.nameGo) {
      el.nameGo.addEventListener('click', e => { e.preventDefault(); sign(el.nameIn); });
    }
    el.overForm.addEventListener('submit', e => { e.preventDefault(); sign(el.overIn); });
    try { S.name = tidy(localStorage.getItem(KEY)); } catch (_) {}
    render();
    const c = window.claude; let db = null, user = null;
    if (c && typeof c.use === 'function') { try { [db, user] = await Promise.all([c.use('db'), c.use('user')]); } catch (_) {} }
    if (!db) {
      S.state = 'live';
      S.ready = true;
      S.write = true;
      S.uid = 'local_hero';
      const LOCAL_KEY = 'tenarms.scores.local';
      function loadLocal() {
        try {
          const raw = localStorage.getItem(LOCAL_KEY);
          if (raw) return JSON.parse(raw);
        } catch (_) {}
        return [
          { id: 'c1', name: 'Shadow-Blade', score: 185420, wave: 18, kills: 142, combo: 88, secs: 480, weapon: 'katana' },
          { id: 'c2', name: 'Storm-Walker', score: 142300, wave: 15, kills: 110, combo: 64, secs: 390, weapon: 'swords' },
          { id: 'c3', name: 'Iron-Vesper', score: 98650, wave: 12, kills: 78, combo: 45, secs: 310, weapon: 'greatsword' },
          { id: 'c4', name: 'Ghost-Ronin', score: 64200, wave: 9, kills: 52, combo: 32, secs: 240, weapon: 'daggers' },
        ];
      }
      S.rows = loadLocal();
      sync = function() {
        const u = S.unsaved;
        if (u && S.name) {
          const newRow = { id: S.uid, name: S.name, score: u.score, wave: u.wave, kills: u.kills, combo: u.combo, secs: u.secs, weapon: u.weapon, at: new Date().toISOString() };
          S.mine = newRow;
          const rows = loadLocal().filter(r => r.id !== S.uid);
          rows.push(newRow);
          rows.sort((a, b) => b.score - a.score);
          S.rows = rows.slice(0, TOP);
          try { localStorage.setItem(LOCAL_KEY, JSON.stringify(S.rows)); } catch (_) {}
          S.unsaved = null;
        } else if (S.name) {
          // Player edited callsign! Update row or create entry
          const currentBest = Math.max(G.best || 0, S.mine ? S.mine.score : 0);
          const newRow = {
            id: S.uid,
            name: S.name,
            score: currentBest,
            wave: S.mine ? S.mine.wave : Math.max(1, G.wave || 1),
            kills: S.mine ? S.mine.kills : (G.kills || 0),
            combo: S.mine ? S.mine.combo : (G.comboMax || 0),
            secs: S.mine ? S.mine.secs : 0,
            weapon: (typeof player === 'object' && player && player.wi !== undefined && typeof WEAPONS !== 'undefined' && WEAPONS[player.wi]) ? WEAPONS[player.wi].id : 'katana',
            at: new Date().toISOString()
          };
          S.mine = newRow;
          const rows = loadLocal().filter(r => r.id !== S.uid);
          if (newRow.score > 0) {
            rows.push(newRow);
            rows.sort((a, b) => b.score - a.score);
          }
          S.rows = rows.slice(0, TOP);
          try { localStorage.setItem(LOCAL_KEY, JSON.stringify(S.rows)); } catch (_) {}
        }
        if (el.nameGo) {
          el.nameGo.textContent = 'SAVED!';
          setTimeout(() => { if (el.nameGo) el.nameGo.textContent = 'SAVE'; }, 1200);
        }
        render();
      };
      render();
      return;
    }
    S.db = db; S.write = false;
    if (user) {
      try {
        const [id, own, can] = await Promise.all([user.id(), user.isOwner(), user.can('data.write')]);
        S.uid = id || null; S.owner = !!own; S.write = !S.uid || can === false ? false : can === true ? true : null;
      } catch (_) {}
    }
    listen(); render();
  }
  return { init, finish, start, live, open, state: S };
})();
