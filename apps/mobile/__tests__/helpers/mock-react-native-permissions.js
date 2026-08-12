const PERMISSIONS = {
  IOS: {
    CAMERA: "ios.permission.CAMERA",
    MICROPHONE: "ios.permission.MICROPHONE",
    PHOTO_LIBRARY_ADD_ONLY: "ios.permission.PHOTO_LIBRARY_ADD_ONLY"
  },
  ANDROID: {
    CAMERA: "android.permission.CAMERA",
    RECORD_AUDIO: "android.permission.RECORD_AUDIO",
    WRITE_EXTERNAL_STORAGE: "android.permission.WRITE_EXTERNAL_STORAGE"
  }
};

const RESULTS = {
  GRANTED: "granted",
  LIMITED: "limited",
  DENIED: "denied",
  BLOCKED: "blocked",
  UNAVAILABLE: "unavailable"
};

const check = jest.fn().mockResolvedValue(RESULTS.DENIED);
const request = jest.fn().mockResolvedValue(RESULTS.GRANTED);
const openSettings = jest.fn().mockResolvedValue(undefined);

module.exports = {
  __esModule: true,
  default: { PERMISSIONS, RESULTS, check, request, openSettings },
  PERMISSIONS,
  RESULTS,
  check,
  request,
  openSettings
};
