const React = require("react");
const ReactNative = require("react-native");

const ReanimatedSwipeable = React.forwardRef(
  function ReanimatedSwipeable(props, ref) {
    React.useImperativeHandle(
      ref,
      () => ({
        close: () => {},
        openLeft: () => {},
        openRight: () => {},
        reset: () => {}
      }),
      []
    );
    return React.createElement(ReactNative.View, props, props.children);
  }
);

module.exports = {
  __esModule: true,
  default: ReanimatedSwipeable,
  ReanimatedSwipeable
};
