const notifee = {
  createChannel: jest.fn().mockResolvedValue("mushroom-messages"),
  displayNotification: jest.fn().mockResolvedValue(undefined),
  cancelNotification: jest.fn().mockResolvedValue(undefined),
  cancelDisplayedNotification: jest.fn().mockResolvedValue(undefined),
  requestPermission: jest.fn().mockResolvedValue(undefined),
  onForegroundEvent: jest.fn(() => jest.fn()),
  onBackgroundEvent: jest.fn(),
  getInitialNotification: jest.fn().mockResolvedValue(null),
  EventType: {
    PRESS: 1
  },
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4
  }
};

module.exports = notifee;
