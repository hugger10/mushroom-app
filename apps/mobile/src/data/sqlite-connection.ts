import { open, type NitroSQLiteConnection } from "react-native-nitro-sqlite";
// Deep imports into the package's internals. nitro-sqlite tracks open
// databases in two independent places:
//   1) the native HybridObject (keyed by `name` only — `location` is ignored
//      after first open)
//   2) a module-level JS Map in DatabaseQueue.js, also keyed by `name`
// `connection.close()` clears both, but if the JS-level `active` slot is
// lost (Metro Fast Refresh, a throw mid-teardown, the logout path bypassing
// closeActiveMobileSQLiteConnection, etc) neither layer gets released and
// the next `open({ name: "im.db", ... })` throws
//   "Database im.db is already open. There is already a connection to the
//   database."
// Re-implementing close on top of the public API is the cleanest fix: we
// call closeDatabaseQueue (JS Map) ourselves and HybridNitroSQLite.close
// (native side) directly, both wrapped in try/catch so a no-op call is
// always safe.
import { HybridNitroSQLite } from "react-native-nitro-sqlite/lib/module/nitro.js";
import {
  closeDatabaseQueue,
  isDatabaseOpen
} from "react-native-nitro-sqlite/lib/module/DatabaseQueue.js";
import log from "../utils/log";

const DATABASE_NAME = "im.db";

// Defensive smoke-check: nitro-sqlite's deep imports above are private
// API. If a future upgrade renames / removes any of these symbols, the
// named import above would already throw at module load, but a runtime
// `typeof` guard surfaces partial breakage (e.g. tree-shaken to a no-op
// stub) with an actionable message instead of a generic "already open"
// further down the call chain.
if (
  typeof HybridNitroSQLite?.close !== "function" ||
  typeof closeDatabaseQueue !== "function" ||
  typeof isDatabaseOpen !== "function"
) {
  log
    .scope("sqlite-connection")
    .warn(
      "nitro-sqlite internal symbols missing or changed shape; " +
        "force-close on logout may be a no-op. Audit react-native-nitro-sqlite upgrade."
    );
}

/**
 * Force-release any lingering handle on `DATABASE_NAME`, both on the JS
 * `DatabaseQueue` side and on the native `HybridNitroSQLite` side.
 *
 * See the deep-import block above for why both layers must be cleared.
 *
 * Both calls are best-effort: it is legitimate (and the common case the
 * first time we open the DB for a uid) for there to be no entry to clean
 * up, in which case both helpers throw and we swallow.
 */
function forceNativeClose() {
  // 1) JS-level DatabaseQueue map. Guarded by isDatabaseOpen because
  //    closeDatabaseQueue calls getDatabaseQueue which throws when the
  //    entry doesn't exist.
  try {
    if (isDatabaseOpen(DATABASE_NAME)) {
      closeDatabaseQueue(DATABASE_NAME);
    }
  } catch {
    // best effort
  }
  // 2) Native HybridObject side. Will throw with "Database is not open"
  //    when no native handle exists; that's the desired post-state.
  try {
    HybridNitroSQLite.close(DATABASE_NAME);
  } catch {
    // best effort
  }
}

type ActiveEntry = {
  uid: string;
  connection: NitroSQLiteConnection;
};

let active: ActiveEntry | null = null;

type ResetCallback = () => void;
const resetCallbacks = new Set<ResetCallback>();

export function onMobileSQLiteReset(cb: ResetCallback) {
  resetCallbacks.add(cb);
  return () => {
    resetCallbacks.delete(cb);
  };
}

function runResetCallbacks() {
  for (const cb of resetCallbacks) {
    try {
      cb();
    } catch {
      // best effort
    }
  }
}

function locationForUid(uid: string) {
  return `users/${uid}/db`;
}

export function openMobileSQLiteForUser(uid: string): NitroSQLiteConnection {
  if (!uid) {
    throw new Error("openMobileSQLiteForUser requires a non-empty uid");
  }

  if (active && active.uid === uid) {
    return active.connection;
  }

  if (active && active.uid !== uid) {
    try {
      active.connection.close();
    } catch {
      // best effort
    }
    active = null;
    runResetCallbacks();
  }

  // Nitro-sqlite keys connections by `name` at the native layer. If the
  // previous JS-level teardown was skipped (Metro Fast Refresh, crash,
  // logout path that bypassed teardownActiveSession), the native slot
  // for DATABASE_NAME may still be held even though `active` is null —
  // and the new `open({ name, location })` would throw "already open".
  // Eagerly release the native slot before opening; this is a no-op when
  // no native handle exists.
  forceNativeClose();

  let connection: NitroSQLiteConnection;
  try {
    connection = open({
      name: DATABASE_NAME,
      location: locationForUid(uid)
    });
  } catch (error) {
    // Defensive: if some other code path opened the DB between our
    // forceNativeClose and open (shouldn't happen but cheap to handle),
    // close + retry once. After this we let the error propagate.
    if (
      error instanceof Error &&
      /already open|already a connection/i.test(error.message)
    ) {
      forceNativeClose();
      connection = open({
        name: DATABASE_NAME,
        location: locationForUid(uid)
      });
    } else {
      throw error;
    }
  }
  active = { uid, connection };
  return connection;
}

export function getActiveMobileSQLiteConnection(): NitroSQLiteConnection | null {
  return active?.connection ?? null;
}

export function getActiveMobileSQLiteUid(): string | null {
  return active?.uid ?? null;
}

/**
 * @deprecated Use {@link openMobileSQLiteForUser} after binding an active user.
 * Throws if no user is currently bound.
 */
export function getMobileSQLiteConnection(): NitroSQLiteConnection {
  if (!active) {
    throw new Error(
      "Mobile SQLite is not bound to any user. Call openMobileSQLiteForUser(uid) first."
    );
  }
  return active.connection;
}

export function closeActiveMobileSQLiteConnection() {
  if (!active) {
    // Even with no JS-side handle, ensure the native slot is released so
    // a subsequent openMobileSQLiteForUser() doesn't trip "already open".
    forceNativeClose();
    return;
  }
  try {
    active.connection.close();
  } catch {
    // best effort
  }
  active = null;
  runResetCallbacks();
  // Belt-and-suspenders: if connection.close() above threw before the
  // native side actually released the slot, drop it now.
  forceNativeClose();
}

export function dropMobileSQLiteForUser(uid: string) {
  if (active && active.uid === uid) {
    try {
      active.connection.delete();
    } catch {
      // best effort
    }
    active = null;
    runResetCallbacks();
    // delete() implies close(); still ensure native slot is released for
    // the same reasons documented on forceNativeClose().
    forceNativeClose();
    return;
  }

  // Not currently active — open then delete to drop the file. Make sure
  // no stale native slot is held first, otherwise the open() below would
  // throw "already open".
  forceNativeClose();
  try {
    const tmp = open({ name: DATABASE_NAME, location: locationForUid(uid) });
    tmp.delete();
  } catch {
    // best effort
  }
  forceNativeClose();
}
