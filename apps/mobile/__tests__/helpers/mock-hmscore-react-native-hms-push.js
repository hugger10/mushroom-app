const createSubscription = () => ({
  remove: jest.fn()
});

class RNRemoteMessage {
  constructor(message = {}) {
    this.message = message;
  }

  getDataOfMap() {
    return this.message.dataOfMap ?? this.message.data ?? null;
  }

  getData() {
    return this.message.data ?? null;
  }

  getNotificationTitle() {
    return this.message.title ?? null;
  }

  getBody() {
    return this.message.body ?? null;
  }
}

const HmsPushEvent = {
  onRemoteMessageReceived: jest.fn(() => createSubscription()),
  onTokenReceived: jest.fn(() => createSubscription()),
  onNotificationOpenedApp: jest.fn(() => createSubscription())
};

const HmsPushInstanceId = {
  getToken: jest.fn().mockRejectedValue(new Error("HMS unavailable"))
};

const HmsPushMessaging = {
  turnOnPush: jest.fn().mockResolvedValue(undefined),
  getInitialNotification: jest.fn().mockResolvedValue(null),
  setBackgroundMessageHandler: jest.fn()
};

module.exports = {
  HmsPushEvent,
  HmsPushInstanceId,
  HmsPushMessaging,
  RNRemoteMessage
};
