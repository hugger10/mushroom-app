const MockCamera = jest.fn().mockImplementation(() => null);

module.exports = {
  __esModule: true,
  Camera: MockCamera,
  CommonResolutions: {},
  useCameraDevice: jest.fn().mockReturnValue({ id: "mock" }),
  useCameraPermission: jest.fn().mockReturnValue({ hasPermission: true }),
  useMicrophonePermission: jest.fn().mockReturnValue({ hasPermission: true }),
  useVideoOutput: jest.fn().mockReturnValue({ buffers: [] }),
  useFrameProcessor: jest.fn(),
  runAsync: jest.fn()
};
