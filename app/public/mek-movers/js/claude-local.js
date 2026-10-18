/*
 * claude-local.js
 * Lokale vervanger van de claude.ai-runtime (window.claude.use).
 *
 * De MEK-apps zijn gebouwd als claude.ai-artifacts en vragen hun database en
 * downloads op via `await claude.use('db')` en `await claude.use('downloads')`.
 * Dit bestand levert dezelfde functies lokaal:
 *
 *   - db: collections met onSnapshot, doc(id).set/update/delete, add, get.
 *       MEK Sales Hub-versie: de gegevens staan in de PostgreSQL-database van de Sales Hub
 *       (tabel mm_documents, via /mek-movers/api/...) en wijzigingen worden live naar
 *       andere geopende tabbladen gestuurd. Alleen ingelogde gebruikers; viewers lezen alleen.
 *       Is de server niet bereikbaar of de sessie verlopen, dan gaat het venster naar de
 *       inlogpagina (geen stille terugval op browseropslag, zodat er niets verloren gaat).
 *       Alleen bij openen als bestand (file://) wordt browseropslag gebruikt.
 *   - downloads: save({ filename, data }) -> normale browserdownload.
 */
(function () {
  'use strict';

  var API = 'api';
  var LS_KEY = 'mek-movers-db';
  var CLIENT = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var isHttp = location.protocol === 'http:' || location.protocol === 'https:';

  var state = null;          // { collection: { id: data } }
  var listeners = {};        // collection -> [ { cb } ]
  var backend = null;
  var ready = null;

  function toLogin() { try { window.top.location.href = '/login'; } catch (e) { location.href = '/login'; } }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function err(msg, code) { var e = new Error(msg); e.code = code; return e; }

  function snapshot(col) {
    var docs = Object.keys(state[col] || {}).map(function (id) {
      var d = state[col][id];
      return { id: id, exists: true, data: function () { return clone(d); } };
    });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (fn) { docs.forEach(fn); } };
  }

  function emit(col) {
    (listeners[col] || []).forEach(function (l) {
      try { l.cb(snapshot(col)); } catch (e) { console.error(e); }
    });
  }

  function applyLocal(op, col, id, data) {
    if (!state[col]) state[col] = {};
    if (op === 'set') state[col][id] = data;
    else if (op === 'update') state[col][id] = Object.assign({}, state[col][id] || {}, data);
    else if (op === 'delete') delete state[col][id];
    emit(col);
  }

  // ---------- opslag via de lokale server ----------
  var serverBackend = {
    name: 'server',
    load: function () {
      return fetch(API + '/db', { cache: 'no-store' }).then(function (r) {
        if (r.status === 401 || r.redirected) { toLogin(); throw err('Niet ingelogd', 'unauthenticated'); }
        if (!r.ok) throw err('Server antwoordt niet (' + r.status + ')', 'unavailable');
        return r.json();
      });
    },
    write: function (op, col, id, data) {
      var method = op === 'set' ? 'PUT' : op === 'update' ? 'PATCH' : 'DELETE';
      return fetch(API + '/db/' + encodeURIComponent(col) + '/' + encodeURIComponent(id), {
        method: method,
        headers: { 'Content-Type': 'application/json', 'X-Client': CLIENT },
        body: op === 'delete' ? undefined : JSON.stringify(data)
      }).then(function (r) {
        if (r.status === 401 || r.redirected) { toLogin(); throw err('Niet ingelogd', 'unauthenticated'); }
        if (r.status === 403) throw err('Je hebt alleen leesrechten (viewer).', 'permission-denied');
        if (!r.ok) return r.text().then(function (t) { throw err('Opslaan mislukt: ' + (t || r.status), 'write-failed'); });
      });
    },
    subscribe: function () {
      if (!window.EventSource) return;
      var es = new EventSource(API + '/events');
      es.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!m || m.client === CLIENT) return;
        if (m.op === 'reload') { serverBackend.load().then(function (s) { state = s || {}; Object.keys(listeners).forEach(emit); }); return; }
        applyLocal(m.op, m.col, m.id, m.data);
      };
    }
  };

  // ---------- terugval: browseropslag (alleen deze browser) ----------
  var localBackend = {
    name: 'browser',
    load: function () {
      try { return Promise.resolve(JSON.parse(localStorage.getItem(LS_KEY) || '{}')); }
      catch (e) { return Promise.resolve({}); }
    },
    write: function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); return Promise.resolve(); }
      catch (e) { return Promise.reject(err('Browseropslag is vol of niet beschikbaar', 'quota')); }
    },
    subscribe: function () {
      window.addEventListener('storage', function (e) {
        if (e.key !== LS_KEY || !e.newValue) return;
        try { state = JSON.parse(e.newValue); Object.keys(listeners).forEach(emit); } catch (x) { /* negeren */ }
      });
    }
  };

  function init() {
    if (ready) return ready;
    ready = (async function () {
      backend = isHttp ? serverBackend : localBackend;
      // Sales Hub: geen terugval op browseropslag als de server faalt (fout wordt doorgegeven)
      state = await backend.load();
      state = state || {};
      backend.subscribe();
      console.info('[MEK lokaal] Database: ' + backend.name);
    })();
    return ready;
  }

  async function write(op, col, id, data) {
    await init();
    if (op !== 'delete') {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw err('Een document moet een object zijn', 'invalid-argument');
      data = clone(data);
    }
    var prev = state[col] && state[col][id] !== undefined ? clone(state[col][id]) : undefined;
    if (op === 'update' && prev === undefined) throw err('Document ' + col + '/' + id + ' bestaat niet', 'not-found');
    applyLocal(op, col, id, data);
    try { await backend.write(op, col, id, data); }
    catch (e) {
      // terugdraaien zodat het scherm de echte stand laat zien
      if (prev === undefined) delete state[col][id]; else state[col][id] = prev;
      emit(col);
      throw e;
    }
  }

  var db = {
    collection: function (name) {
      return {
        onSnapshot: function (cb, errCb) {
          var l = { cb: cb };
          (listeners[name] = listeners[name] || []).push(l);
          init().then(function () { cb(snapshot(name)); }).catch(function (e) { if (errCb) errCb(e); });
          return function () { listeners[name] = (listeners[name] || []).filter(function (x) { return x !== l; }); };
        },
        doc: function (id) {
          id = id || genId();
          return {
            id: id,
            set: function (d) { return write('set', name, id, d); },
            update: function (d) { return write('update', name, id, d); },
            delete: function () { return write('delete', name, id); },
            get: async function () {
              await init();
              var d = state[name] && state[name][id];
              return { id: id, exists: d !== undefined, data: function () { return clone(d); } };
            }
          };
        },
        add: async function (d) { var id = genId(); await write('set', name, id, d); return { id: id }; },
        get: async function () { await init(); return snapshot(name); }
      };
    }
  };

  var downloads = {
    save: async function (opts) {
      opts = opts || {};
      var data = opts.data, blob = data instanceof Blob ? data : new Blob([data == null ? '' : data]);
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = opts.filename || 'download'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      return { ok: true };
    }
  };

  window.claude = window.claude || {};
  window.claude.use = async function (name) {
    if (name === 'db') { await init(); return db; }
    if (name === 'downloads') return downloads;
    throw err('"' + name + '" is niet beschikbaar in de lokale versie', 'unavailable');
  };
})();
