// Mock for react-native-nitro-sqlite/lib/module/nitro.js
// 提供 HybridNitroSQLite 私有 API stub，避免测试环境加载真实 native binding。
module.exports = {
  __esModule: true,
  HybridNitroSQLite: {
    close: () => {},
    open: () => {},
    execute: () => ({ rowsAffected: 0 }),
    executeAsync: async () => ({ rowsAffected: 0 })
  }
};
