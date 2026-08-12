module.exports = {
  setup: jest.fn().mockResolvedValue(undefined),
  addEventListener: jest.fn(),
  displayIncomingCall: jest.fn().mockResolvedValue(undefined),
  endCall: jest.fn().mockResolvedValue(undefined),
  setCurrentCallActive: jest.fn().mockResolvedValue(undefined),
  backToForeground: jest.fn()
};
