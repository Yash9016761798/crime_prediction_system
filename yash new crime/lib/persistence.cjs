const db = require('./db.cjs');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Keeps the existing in-memory entity arrays (which every route handler in
 * server.cjs already uses) in sync with PostgreSQL:
 *
 *  - hydrate(): read every table into memory once at boot
 *  - on each mutating request, snapshot the arrays, and after the response
 *    finishes diff them and write back only what changed
 *  - writes are serialised through a promise chain, and the next request
 *    awaits that chain first so it never reads a stale snapshot
 *
 * @param {Array<{key:string, table:string, kind?:'array'|'object',
 *                container:()=>any, applyLoaded?:(loaded:any)=>void,
 *                prepareSave?:(current:any)=>any}>} entities
 */
function createPersistence(entities) {
  let snapshots = null;
  let chain = Promise.resolve();

  const readAll = () => {
    const out = {};
    for (const entity of entities) out[entity.key] = JSON.stringify(entity.container());
    return out;
  };

  async function hydrate() {
    for (const entity of entities) {
      let loaded;
      if (entity.kind === 'object') {
        loaded = await db.loadSettings();
        if (loaded == null) {
          await db.saveSettings(entity.container());
          continue;
        }
      } else {
        loaded = entity.key === 'users' ? await db.loadUsers() : await db.loadEntity(entity.table);
      }
      entity.applyLoaded ? entity.applyLoaded(loaded) : replaceContents(entity.container(), loaded);
    }
    snapshots = readAll();
    return snapshots;
  }

  async function persist(keys) {
    for (const key of keys) {
      const entity = entities.find(e => e.key === key);
      if (!entity) continue;
      const current = entity.container();
      const payload = entity.prepareSave ? entity.prepareSave(current) : current;
      if (entity.kind === 'object') {
        await db.saveSettings(payload);
      } else {
        await db.saveEntity(entity.table, payload);
      }
    }
  }

  function schedule(keys) {
    if (!keys.length) return chain;
    chain = chain.then(() => persist(keys)).catch(err => {
      console.error('[persist] failed to write entities:', keys.join(', '), err.message);
    });
    return chain;
  }

  const middleware = async (req, res, next) => {
    try {
      // Flush any pending write so the snapshot below matches the database.
      await chain;

      const mutating = MUTATING_METHODS.has(req.method);
      const before = mutating ? readAll() : null;

      if (mutating) {
        res.on('finish', () => {
          const after = readAll();
          const changed = Object.keys(after).filter(key => before[key] !== after[key]);
          schedule(changed);
        });
      }
      next();
    } catch (error) {
      console.error('[persist] middleware error:', error.message);
      next();
    }
  };

  return {
    middleware,
    hydrate,
    persistAll: () => schedule(entities.map(entity => entity.key)),
    flush: () => chain,
    snapshot: readAll,
  };
}

function replaceContents(container, loaded) {
  if (Array.isArray(container)) {
    container.splice(0, container.length, ...loaded);
    return;
  }
  Object.keys(container).forEach(key => delete container[key]);
  Object.assign(container, loaded);
}

module.exports = { createPersistence, replaceContents, MUTATING_METHODS };
