const React = require("react");
const { View } = require("react-native");

function Video(props) {
  return React.createElement(View, {
    ...props,
    testID: props.testID || "mock-video"
  });
}

module.exports = {
  __esModule: true,
  default: Video
};
