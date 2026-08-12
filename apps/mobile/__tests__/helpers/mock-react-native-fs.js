const files = new Map();

module.exports = {
  CachesDirectoryPath: "/tmp/mushroom-cache",
  DocumentDirectoryPath: "/tmp/mushroom-docs",
  TemporaryDirectoryPath: "/tmp/mushroom-tmp",
  mkdir: jest.fn(async () => undefined),
  exists: jest.fn(async path => files.has(path)),
  unlink: jest.fn(async path => {
    files.delete(path);
  }),
  moveFile: jest.fn(async (from, to) => {
    files.set(to, files.get(from) || "");
    files.delete(from);
  }),
  hash: jest.fn(
    async path => `hash-${String(path).replace(/[^a-z0-9]/gi, "")}`
  ),
  downloadFile: jest.fn(options => {
    files.set(options.toFile, "downloaded");
    return {
      jobId: 1,
      promise: Promise.resolve({
        jobId: 1,
        statusCode: 200,
        bytesWritten: 10
      })
    };
  }),
  __reset: () => {
    files.clear();
  }
};
