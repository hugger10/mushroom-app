import React from "react";
import ReactTestRenderer from "react-test-renderer";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: jest.fn()
}));

import { useNavigation } from "@react-navigation/native";
import { AddContactSheet } from "../src/components/overlays/AddContactSheet";

const navigateMock = jest.fn();
(useNavigation as jest.Mock).mockReturnValue({ navigate: navigateMock });

type SheetProps = React.ComponentProps<typeof AddContactSheet>;

/**
 * Renders a controlled wrapper that toggles `visible` to false when
 * `onClose` is invoked. The post-T5 implementation dispatches navigation
 * synchronously inside the option onSelect handler (no InteractionManager
 * deferral), so close+navigate happen in the same tick.
 */
function ControlledSheet(
  props: Omit<SheetProps, "visible" | "onClose"> & {
    onClose: () => void;
  }
) {
  const [visible, setVisible] = React.useState(true);
  return (
    <AddContactSheet
      {...props}
      visible={visible}
      onClose={() => {
        setVisible(false);
        props.onClose();
      }}
    />
  );
}

function createCallbacks(overrides: Partial<Omit<SheetProps, "visible">> = {}) {
  return {
    onClose: jest.fn(),
    onOpenQRScanner: jest.fn(),
    ...overrides
  };
}

describe("AddContactSheet", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  test("renders all four entries when visible", async () => {
    const cb = createCallbacks();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ControlledSheet {...cb} />);
    });
    const root = renderer!.root;

    expect(
      root.findAllByProps({ testID: "add-contact-sheet" }).length
    ).toBeGreaterThan(0);
    for (const id of [
      "add-contact-entry-add-contact",
      "add-contact-entry-from-address-book",
      "add-contact-entry-scan-qr"
    ]) {
      expect(root.findAllByProps({ testID: id }).length).toBeGreaterThan(0);
    }

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("addContact entry closes sheet and navigates to AddContact", async () => {
    const cb = createCallbacks();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ControlledSheet {...cb} />);
    });
    const root = renderer!.root;

    await ReactTestRenderer.act(async () => {
      root
        .findByProps({ testID: "add-contact-entry-add-contact" })
        .props.onPress();
    });

    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("AddContact");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("scanQr closes sheet and delegates to onOpenQRScanner", async () => {
    const cb = createCallbacks();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ControlledSheet {...cb} />);
    });
    const root = renderer!.root;

    await ReactTestRenderer.act(async () => {
      root.findByProps({ testID: "add-contact-entry-scan-qr" }).props.onPress();
    });

    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onOpenQRScanner).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("fromAddressBook navigates to AddressBookMatchList", async () => {
    const cb = createCallbacks();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ControlledSheet {...cb} />);
    });
    const root = renderer!.root;

    await ReactTestRenderer.act(async () => {
      root
        .findByProps({ testID: "add-contact-entry-from-address-book" })
        .props.onPress();
    });

    expect(navigateMock).toHaveBeenCalledWith("AddressBookMatchList");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
