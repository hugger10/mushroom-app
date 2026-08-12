module.exports = {
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi"
    })
  ),
  addEventListener: jest.fn(() => jest.fn())
};
