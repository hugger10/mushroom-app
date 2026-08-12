const React = require("react");

function StackNavigator({ children }) {
  const screens = React.Children.toArray(children);
  const firstScreen = screens[0];
  return React.createElement(React.Fragment, null, firstScreen);
}

function StackScreen({ children, component: Component }) {
  if (typeof children === "function") {
    return children({});
  }
  if (Component) {
    return React.createElement(Component);
  }
  return React.createElement(React.Fragment, null, children);
}

module.exports = {
  createNativeStackNavigator: () => ({
    Navigator: StackNavigator,
    Screen: StackScreen
  })
};
