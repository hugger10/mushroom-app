const React = require("react");
const { ScrollView } = require("react-native");

const FlashList = React.forwardRef(function FlashList(props, ref) {
  const {
    data = [],
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListHeaderComponent,
    ListFooterComponent,
    children,
    ...rest
  } = props;

  React.useImperativeHandle(ref, () => ({
    scrollToEnd: jest.fn(),
    scrollToIndex: jest.fn(),
    scrollToItem: jest.fn(),
    scrollToOffset: jest.fn()
  }));

  function renderEdge(component) {
    if (!component) return null;
    if (React.isValidElement(component)) return component;
    if (typeof component === "function") return React.createElement(component);
    return component;
  }

  const content =
    data.length > 0
      ? data.map((item, index) =>
          React.createElement(
            React.Fragment,
            {
              key: keyExtractor ? keyExtractor(item, index) : String(index)
            },
            renderItem
              ? renderItem({
                  item,
                  index,
                  target: "Cell",
                  extraData: undefined
                })
              : null
          )
        )
      : typeof ListEmptyComponent === "function"
        ? React.createElement(ListEmptyComponent)
        : ListEmptyComponent;

  return React.createElement(
    ScrollView,
    rest,
    renderEdge(ListHeaderComponent),
    content,
    renderEdge(ListFooterComponent),
    children
  );
});

module.exports = {
  FlashList
};
