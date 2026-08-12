// Ambient declarations for nitro-sqlite deep imports.
//
// The package's `exports` map only publishes the top-level entry, so
// TS rejects subpath imports despite Metro resolving them at runtime.
// We deep-import two internal modules from
// `apps/mobile/src/data/sqlite-connection.ts` to clear the JS-level
// DatabaseQueue map and the native HybridObject directly when the
// public `connection.close()` path has been lost (Metro Fast Refresh,
// teardown threw, etc). See the comment block in sqlite-connection.ts
// for the full rationale.

declare module "react-native-nitro-sqlite/lib/module/nitro.js" {
  export const HybridNitroSQLite: {
    open(name: string, location?: string): void;
    close(name: string): void;
    drop(name: string, location?: string): void;
    [key: string]: unknown;
  };
}

declare module "react-native-nitro-sqlite/lib/module/DatabaseQueue.js" {
  export function closeDatabaseQueue(dbName: string): void;
  export function isDatabaseOpen(dbName: string): boolean;
}
