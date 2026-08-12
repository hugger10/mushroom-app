const React = require("react");
const ReactNative = require("react-native");

function Passthrough(props) {
  return React.createElement(ReactNative.View, props, props.children);
}

// Fluent gesture builder: every method returns the same object so callers can
// chain `.onStart(...).onUpdate(...)` etc. without a full API surface.
function createGestureBuilder() {
  const builder = new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === "then") {
          return undefined;
        }
        return () => builder;
      }
    }
  );
  return builder;
}

const Gesture = {
  Pan: createGestureBuilder,
  Tap: createGestureBuilder,
  LongPress: createGestureBuilder,
  Native: createGestureBuilder,
  Panning: createGestureBuilder,
  GestureDetector: Passthrough
};

module.exports = {
  __esModule: true,
  GestureHandlerRootView: Passthrough,
  GestureDetector: Passthrough,
  Gesture,
  default: {
    GestureHandlerRootView: Passthrough,
    GestureDetector: Passthrough,
    Gesture
  }
};
