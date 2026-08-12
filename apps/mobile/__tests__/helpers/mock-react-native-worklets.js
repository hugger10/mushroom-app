function runOnJS(fn) {
  return fn;
}

function runOnUI(fn) {
  return fn;
}

function scheduleOnRN(fn) {
  return fn();
}

function scheduleOnUI(fn) {
  return fn();
}

function makeShareableCloneRecursive(value) {
  return value;
}

function makeShareable(value) {
  return value;
}

module.exports = {
  __esModule: true,
  default: {
    runOnJS,
    runOnUI,
    scheduleOnRN,
    scheduleOnUI,
    makeShareableCloneRecursive,
    makeShareable
  },
  runOnJS,
  runOnUI,
  scheduleOnRN,
  scheduleOnUI,
  makeShareableCloneRecursive,
  makeShareable
};
