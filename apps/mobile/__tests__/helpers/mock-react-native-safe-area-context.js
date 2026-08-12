const insets = { top: 0, right: 0, bottom: 0, left: 0 };
const frame = { x: 0, y: 0, width: 0, height: 0 };

const Passthrough = ({ children }) => children ?? null;

module.exports = {
  SafeAreaProvider: Passthrough,
  SafeAreaView: Passthrough,
  SafeAreaInsetsContext: {
    Provider: Passthrough,
    Consumer: ({ children }) =>
      typeof children === "function" ? children(insets) : null
  },
  SafeAreaFrameContext: {
    Provider: Passthrough,
    Consumer: ({ children }) =>
      typeof children === "function" ? children(frame) : null
  },
  useSafeAreaInsets: () => insets,
  useSafeAreaFrame: () => frame,
  initialWindowMetrics: { insets, frame }
};
