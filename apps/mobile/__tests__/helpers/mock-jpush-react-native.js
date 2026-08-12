// Jest mock for jpush-react-native. The real module talks to native JPush
// modules, which do not exist in the Jest environment. Exposes a minimal,
// no-op surface so push registration/event wiring can be imported safely.
const registerID = "test-jpush-register-id";

module.exports = {
  default: {
    setLoggerEnable: () => {},
    init: () => {},
    getRegistrationID: callback => callback({ registerID }),
    addNotificationListener: () => {},
    addCustomMessageListener: () => {},
    addConnectEventListener: () => {},
    removeListener: () => {}
  }
};
