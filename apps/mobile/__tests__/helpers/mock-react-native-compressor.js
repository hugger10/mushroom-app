// Mock for react-native-compressor (depends on native modules unavailable in tests).
module.exports = {
  __esModule: true,
  Image: {
    compress: jest.fn(async uri => uri),
    cancel: jest.fn()
  },
  Video: {
    compress: jest.fn(async uri => uri),
    cancel: jest.fn()
  },
  Audio: {
    compress: jest.fn(async uri => uri),
    cancel: jest.fn()
  },
  default: {}
};
