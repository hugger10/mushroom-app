const instance = {
  registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(undefined),
  requestPermission: jest.fn().mockResolvedValue(1),
  getToken: jest.fn().mockResolvedValue("push-token-test"),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn().mockResolvedValue(null),
  setBackgroundMessageHandler: jest.fn()
};

const messaging = jest.fn(() => instance);
messaging.AuthorizationStatus = {
  AUTHORIZED: 1,
  PROVISIONAL: 2
};

const getMessaging = jest.fn(() => instance);
const getToken = jest.fn(() => instance.getToken());
const deleteToken = jest.fn().mockResolvedValue(undefined);
const registerDeviceForRemoteMessages = jest.fn(() =>
  instance.registerDeviceForRemoteMessages()
);
const requestPermission = jest.fn(() => instance.requestPermission());
const onTokenRefresh = jest.fn((_instance, listener) =>
  instance.onTokenRefresh(listener)
);
const onMessage = jest.fn((_instance, listener) =>
  instance.onMessage(listener)
);
const onNotificationOpenedApp = jest.fn((_instance, listener) =>
  instance.onNotificationOpenedApp(listener)
);
const getInitialNotification = jest.fn(() => instance.getInitialNotification());
const setBackgroundMessageHandler = jest.fn((_instance, handler) =>
  instance.setBackgroundMessageHandler(handler)
);

module.exports = messaging;
module.exports.default = messaging;
module.exports.getMessaging = getMessaging;
module.exports.getToken = getToken;
module.exports.deleteToken = deleteToken;
module.exports.registerDeviceForRemoteMessages =
  registerDeviceForRemoteMessages;
module.exports.requestPermission = requestPermission;
module.exports.onTokenRefresh = onTokenRefresh;
module.exports.onMessage = onMessage;
module.exports.onNotificationOpenedApp = onNotificationOpenedApp;
module.exports.getInitialNotification = getInitialNotification;
module.exports.setBackgroundMessageHandler = setBackgroundMessageHandler;
