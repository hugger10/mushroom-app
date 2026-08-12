// Jest mock for react-native-device-info.
//
// The real module creates a NativeEventEmitter at import time, which throws
// "new NativeEventEmitter() requires a non-null argument" in the Jest
// environment. We return deterministic values so device-identity tests and
// anything importing the runtime keep working without a native device.
const values = {
  getModel: () => "iPhone 15 Pro",
  getSystemName: () => "iOS",
  getSystemVersion: () => "17.5",
  getVersion: () => "1.0",
  getManufacturer: () => "Apple",
  getBrand: () => "Apple"
};

module.exports = values;
