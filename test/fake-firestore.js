/* An in-memory stand-in for the compat Firestore API, just wide enough to
 * run js/db.js for real.
 *
 * Why a fake and not the emulator: the router's failure modes are about
 * WHICH documents get written and what the shadow cache believes, not about
 * rules or networking. A fake lets a test say "this commit fails" and
 * "these two writes overlap" — the two shapes the review found bugs in —
 * which the emulator cannot be made to do on demand. The rules suite covers
 * the emulator side separately.
 *
 * Everything is synchronous underneath; promises resolve on the microtask
 * queue, so `await Promise.resolve()` in a test flushes pending listeners.
 */
'use strict';

const DELETE = {__op: 'delete'};
const SERVER_TS = {__op: 'serverTimestamp'};

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

class FakeStore {
  constructor() {
    this.docs = new Map();       // "a/b/c" -> data object
    this.listeners = [];         // {path, filter, cb, last}
    this.writes = [];            // audit log: {path, type, data}
    this.failNext = null;        // (path, type) => Error|null
  }

  // ── test helpers ───────────────────────────────────────────
  seed(path, data) { this.docs.set(path, clone(data)); }
  read(path) { return clone(this.docs.get(path)); }
  paths(prefix) {
    return [...this.docs.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  /** Writes recorded since the last reset — the per-document diff's proof. */
  written(prefix) {
    return this.writes
        .filter((w) => !prefix || w.path.startsWith(prefix))
        .map((w) => w.path);
  }
  resetWrites() { this.writes = []; }

  // ── internals ──────────────────────────────────────────────
  _apply(path, data, opts) {
    const merge = !!(opts && opts.merge);
    const prev = merge ? (this.docs.get(path) || {}) : {};
    const next = Object.assign({}, prev);
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v === DELETE) delete next[k];
      else if (v === SERVER_TS) next[k] = '<ts>';
      else next[k] = clone(v);
    }
    this.docs.set(path, next);
    this.writes.push({path, type: merge ? 'merge' : 'set'});
  }
  _delete(path) {
    this.docs.delete(path);
    this.writes.push({path, type: 'delete'});
  }
  _fail(path, type) {
    return this.failNext ? this.failNext(path, type) : null;
  }

  /** Deliver a snapshot to every listener whose scope covers `path`. */
  _notify(path, pending) {
    for (const l of this.listeners) {
      if (!path.startsWith(l.path + '/')) continue;
      if (path.slice(l.path.length + 1).includes('/')) continue; // not a direct child
      l.deliver(pending);
    }
  }
}

function makeApi(store) {
  function docRef(path) {
    return {
      path,
      id: path.split('/').pop(),
      get() {
        const d = store.docs.get(path);
        return Promise.resolve(makeDocSnap(path, d));
      },
      set(data, opts) {
        const err = store._fail(path, 'set');
        // Firestore applies locally first, then reverts on rejection — the
        // listener echo is what the router relies on to self-correct.
        if (err) return Promise.reject(err);
        store._apply(path, data, opts);
        store._notify(path, false);
        return Promise.resolve();
      },
      delete() {
        const err = store._fail(path, 'delete');
        if (err) return Promise.reject(err);
        store._delete(path);
        store._notify(path, false);
        return Promise.resolve();
      },
      collection(name) { return collRef(path + '/' + name); },
    };
  }

  function makeDocSnap(path, data, pending) {
    return {
      id: path.split('/').pop(),
      ref: docRef(path),
      exists: data !== undefined,
      data: () => clone(data),
      metadata: {hasPendingWrites: !!pending},
    };
  }

  function matches(data, filter) {
    if (!filter) return true;
    const v = data ? data[filter.field] : undefined;
    if (filter.op === '==') return v === filter.value;
    if (filter.op === 'in') return filter.value.indexOf(v) !== -1;
    throw new Error('fake: unsupported op ' + filter.op);
  }

  function collRef(path, filter) {
    const children = () => [...store.docs.keys()]
        .filter((p) => p.startsWith(path + '/') &&
                       !p.slice(path.length + 1).includes('/'))
        .sort();
    const api = {
      path,
      doc(id) { return docRef(path + '/' + id); },
      where(field, op, value) { return collRef(path, {field, op, value}); },
      get() {
        const docs = children()
            .map((p) => makeDocSnap(p, store.docs.get(p)))
            .filter((d) => matches(d.data(), filter));
        return Promise.resolve(makeQuerySnap(docs, docs.map((d) => ({type: 'added', doc: d}))));
      },
      onSnapshot(cb, errCb) {
        const l = {
          path,
          last: new Map(),
          /* `initial` forces the callback even with nothing to report:
             Firestore always delivers a first snapshot, and init() waits on
             it before the first render. */
          deliver(pending, initial) {
            const now = new Map();
            children().forEach((p) => {
              const data = store.docs.get(p);
              if (matches(data, filter)) now.set(p, data);
            });
            const changes = [];
            for (const [p, data] of now) {
              const before = l.last.get(p);
              if (before === undefined) changes.push({type: 'added', doc: makeDocSnap(p, data, pending)});
              else if (JSON.stringify(before) !== JSON.stringify(data)) {
                changes.push({type: 'modified', doc: makeDocSnap(p, data, pending)});
              }
            }
            for (const [p, data] of l.last) {
              if (!now.has(p)) changes.push({type: 'removed', doc: makeDocSnap(p, data, pending)});
            }
            l.last = now;
            if (!changes.length && !initial) return;
            const docs = [...now.entries()].map(([p, d]) => makeDocSnap(p, d, pending));
            cb(makeQuerySnap(docs, changes, pending));
          },
        };
        store.listeners.push(l);
        // Firestore fires an initial snapshot; do the same so init()'s
        // `await firstSnaps` resolves even for an empty collection.
        Promise.resolve().then(() => l.deliver(false, true));
        return () => {
          const i = store.listeners.indexOf(l);
          if (i !== -1) store.listeners.splice(i, 1);
        };
      },
    };
    return api;
  }

  function makeQuerySnap(docs, changes, pending) {
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      metadata: {hasPendingWrites: !!pending},
      forEach: (fn) => docs.forEach(fn),
      docChanges: () => changes,
    };
  }

  const db = {
    collection: (name) => collRef(name),
    batch() {
      const ops = [];
      return {
        set(ref, data, opts) { ops.push({type: 'set', ref, data, opts}); },
        delete(ref) { ops.push({type: 'delete', ref}); },
        update(ref, data) { ops.push({type: 'update', ref, data}); },
        commit() {
          // Atomic: one rejected op rejects the whole commit and NOTHING
          // is applied. That is the property the router leans on.
          for (const op of ops) {
            const err = store._fail(op.ref.path, op.type);
            if (err) return Promise.reject(err);
          }
          for (const op of ops) {
            if (op.type === 'delete') store._delete(op.ref.path);
            else store._apply(op.ref.path, op.data, op.type === 'update' ? {merge: true} : op.opts);
          }
          const touched = [...new Set(ops.map((o) => o.ref.path))];
          touched.forEach((p) => store._notify(p, false));
          return Promise.resolve();
        },
      };
    },
  };

  const firebase = {
    firestore: {
      FieldValue: {
        delete: () => DELETE,
        serverTimestamp: () => SERVER_TS,
      },
    },
  };

  return {db, firebase};
}

class FakeLocalStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

module.exports = {FakeStore, makeApi, FakeLocalStorage, DELETE, SERVER_TS};
