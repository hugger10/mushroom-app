const React = require("react");

const navigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
  getCurrentRoute: jest.fn(() => ({ name: "Home" })),
  isReady: jest.fn(() => true),
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn()
};

module.exports = {
  CommonActions: {
    navigate: name => ({ type: "NAVIGATE", payload: { name } }),
    reset: payload => ({ type: "RESET", payload })
  },
  NavigationContainer: ({ children, onReady }) => {
    React.useEffect(() => {
      onReady?.();
    }, [onReady]);
    return React.createElement(React.Fragment, null, children);
  },
  useNavigation: () => navigation,
  useNavigationContainerRef: () => navigation,
  createNavigationContainerRef: () => navigation,
  useFocusEffect: callback => {
    React.useEffect(() => {
      return callback();
    }, [callback]);
  }
};
