const ReactNative = require("react-native");

function createAnimatedComponent(Component) {
  return Component;
}

const View = ReactNative.View;
const Text = ReactNative.Text;
const Image = ReactNative.Image;
const ScrollView = ReactNative.ScrollView;

const Reanimated = {
  View,
  Text,
  Image,
  ScrollView,
  createAnimatedComponent,
  default: {
    View,
    Text,
    Image,
    ScrollView,
    createAnimatedComponent
  }
};

function useSharedValue(initial) {
  return { value: initial };
}

function useAnimatedStyle(_factory) {
  return {};
}

function interpolate(_value, _input, output) {
  return output[0];
}

function interpolateColor(_value, _input, output) {
  return output[0];
}

function withTiming(value) {
  return value;
}

function withSpring(value) {
  return value;
}

function withRepeat(value) {
  return value;
}

function withSequence(...values) {
  return values[values.length - 1];
}

function cancelAnimation() {}

const Easing = {
  ease: value => value,
  in: value => value,
  out: value => value,
  inOut: value => value,
  cubic: value => value
};

function runOnJS(fn) {
  return fn;
}

function runOnUI(fn) {
  return fn;
}

module.exports = {
  __esModule: true,
  default: Reanimated,
  View,
  Text,
  Image,
  ScrollView,
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  interpolateColor,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
  runOnJS,
  runOnUI,
  Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" }
};
