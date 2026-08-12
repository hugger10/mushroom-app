// Mock for react-native-share (TurboModule unavailable in jest).
const open = jest.fn(async () => ({ success: true }));

module.exports = {
  __esModule: true,
  default: {
    open,
    shareSingle: jest.fn(async () => ({ success: true })),
    Social: {}
  },
  Social: {}
};
