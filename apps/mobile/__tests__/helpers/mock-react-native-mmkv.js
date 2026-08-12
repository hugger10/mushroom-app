const store = new Map();

module.exports = {
  createMMKV: () => ({
    getString: key => (store.has(key) ? store.get(key) : undefined),
    set: (key, value) => {
      store.set(key, value);
    },
    remove: key => {
      store.delete(key);
    }
  })
};
