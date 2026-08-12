const HapticFeedbackTypes = new Proxy(
  {},
  {
    get: (_target, prop) => String(prop)
  }
);

module.exports = {
  __esModule: true,
  default: {
    trigger: () => {}
  },
  trigger: () => {},
  HapticFeedbackTypes
};
