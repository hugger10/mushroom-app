const defaultApp = { name: "[DEFAULT]" };
const getApps = jest.fn(() => [defaultApp]);
const getApp = jest.fn(() => defaultApp);

module.exports = {
  getApps,
  getApp
};
