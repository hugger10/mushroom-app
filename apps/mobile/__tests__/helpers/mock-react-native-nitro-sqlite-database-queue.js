// Mock for react-native-nitro-sqlite/lib/module/DatabaseQueue.js
// 提供 closeDatabaseQueue/isDatabaseOpen 私有 API stub。
module.exports = {
  __esModule: true,
  closeDatabaseQueue: () => {},
  isDatabaseOpen: () => false,
  getDatabaseQueue: () => null
};
