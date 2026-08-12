const React = require("react");
const ReactNative = require("react-native");

function Passthrough(props) {
  return React.createElement(ReactNative.View, props, props.children);
}

const BottomSheetModal = React.forwardRef(
  function BottomSheetModalMock(props, ref) {
    React.useImperativeHandle(
      ref,
      () => ({
        present: () => {},
        dismiss: () => {},
        snapToIndex: () => {},
        snapToPosition: () => {},
        expand: () => {},
        collapse: () => {},
        close: () => {},
        forceClose: () => {}
      }),
      []
    );
    return React.createElement(ReactNative.View, null, props.children);
  }
);

module.exports = {
  __esModule: true,
  BottomSheet: Passthrough,
  BottomSheetModal,
  BottomSheetView: Passthrough,
  BottomSheetScrollView: Passthrough,
  BottomSheetFlatList: function BottomSheetFlatListMock(props) {
    return React.createElement(ReactNative.View, props, props.children);
  },
  BottomSheetSectionList: Passthrough,
  BottomSheetTextInput: function BottomSheetTextInputMock(props) {
    return React.createElement(ReactNative.TextInput, props);
  },
  BottomSheetBackdrop: Passthrough,
  BottomSheetModalProvider: Passthrough,
  BottomSheetHandle: Passthrough,
  useBottomSheet: () => ({
    snapToIndex: () => {},
    snapToPosition: () => {},
    expand: () => {},
    collapse: () => {},
    close: () => {},
    forceClose: () => {}
  }),
  useBottomSheetModal: () => ({ dismiss: () => {}, dismissAll: () => {} }),
  default: BottomSheetModal
};
