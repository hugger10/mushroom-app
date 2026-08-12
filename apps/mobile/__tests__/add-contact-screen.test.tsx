import React from "react";
import ReactTestRenderer from "react-test-renderer";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: jest.fn()
}));

import { useNavigation } from "@react-navigation/native";
import { AddContactScreen } from "../src/features/add-contact/screens/AddContactScreen";
import {
  AddContactProvider,
  type AddContactProps
} from "../src/features/add-contact/AddContactContext";

const goBackMock = jest.fn();
const navigateMock = jest.fn();
(useNavigation as jest.Mock).mockReturnValue({
  goBack: goBackMock,
  navigate: navigateMock
});

function createProps(
  overrides: Partial<AddContactProps> = {}
): AddContactProps {
  return {
    pending: false,
    addressBookMatches: [],
    addressBookPermission: "unknown",
    addressBookSyncing: false,
    onLookupByPhone: jest.fn().mockResolvedValue({
      matched: false,
      phoneE164: "+8613800138000",
      user: null
    }),
    onSearchUsers: jest.fn().mockResolvedValue([]),
    onAddContact: jest.fn().mockResolvedValue(undefined),
    onOpenChatByUserId: jest.fn().mockResolvedValue(undefined),
    onOpenContactProfile: jest.fn(),
    onRefreshAddressBookMatches: jest.fn(),
    onSaveAddressBookContact: jest.fn(),
    onOpenAddressBookConversation: jest.fn(),
    ...overrides
  };
}

function renderScreen(props: AddContactProps) {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AddContactProvider value={props}>
        <AddContactScreen />
      </AddContactProvider>
    );
  });
  return renderer!;
}

async function typeAndSubmit(
  root: ReactTestRenderer.ReactTestInstance,
  value: string
) {
  ReactTestRenderer.act(() => {
    root.findByProps({ testID: "add-contact-query" }).props.onChangeText(value);
  });
  await ReactTestRenderer.act(async () => {
    root.findByProps({ testID: "add-contact-submit" }).props.onPress();
  });
}

describe("AddContactScreen", () => {
  beforeEach(() => {
    goBackMock.mockReset();
    navigateMock.mockReset();
  });

  test("local-format phone input triggers both endpoints (ambiguous)", async () => {
    const props = createProps();
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "13800138000");

    expect(props.onLookupByPhone).toHaveBeenCalledWith({
      phoneE164: "13800138000",
      defaultCountryCode: "+86"
    });
    expect(props.onSearchUsers).toHaveBeenCalledWith("13800138000");

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("E.164 phone input only calls onLookupByPhone", async () => {
    const props = createProps();
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "+8613800138000");

    expect(props.onLookupByPhone).toHaveBeenCalledWith({
      phoneE164: "+8613800138000",
      defaultCountryCode: "+86"
    });
    expect(props.onSearchUsers).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("non-numeric keyword only calls onSearchUsers", async () => {
    const props = createProps({
      onSearchUsers: jest.fn().mockResolvedValue([])
    });
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "alice");

    expect(props.onSearchUsers).toHaveBeenCalledWith("alice");
    expect(props.onLookupByPhone).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("ambiguous short digits trigger both endpoints and merge results", async () => {
    const props = createProps({
      onLookupByPhone: jest.fn().mockResolvedValue({
        matched: false,
        phoneE164: "+8612345",
        user: null
      }),
      onSearchUsers: jest.fn().mockResolvedValue([
        {
          user_id: 7,
          username: "12345",
          nickname: "User 12345",
          avatar_url: "",
          can_open_direct: true
        }
      ])
    });
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "12345");

    expect(props.onLookupByPhone).toHaveBeenCalled();
    expect(props.onSearchUsers).toHaveBeenCalledWith("12345");
    // Found via username, should appear as a result row
    expect(
      renderer.root.findAllByProps({ testID: "add-contact-result-7" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("phone not-found shows invite button", async () => {
    const props = createProps({
      onLookupByPhone: jest.fn().mockResolvedValue({
        matched: false,
        phoneE164: "+8613800138000",
        user: null
      })
    });
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "13800138000");

    expect(
      renderer.root.findAllByProps({ testID: "add-contact-not-found" }).length
    ).toBeGreaterThan(0);
    expect(
      renderer.root.findAllByProps({ testID: "add-contact-invite" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("matched user can be added; goes back after success with source=phone", async () => {
    const props = createProps({
      onLookupByPhone: jest.fn().mockResolvedValue({
        matched: true,
        phoneE164: "+8613800138000",
        user: {
          user_id: 42,
          username: "bob",
          nickname: "Bob",
          avatar_url: "",
          can_open_direct: true
        }
      })
    });
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "13800138000");

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: "add-contact-confirm-42" })
        .props.onPress();
    });

    expect(props.onAddContact).toHaveBeenCalledWith({
      userId: 42,
      remarkName: undefined,
      source: "phone"
    });
    expect(goBackMock).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("keyword matched user uses source=username", async () => {
    const props = createProps({
      onSearchUsers: jest.fn().mockResolvedValue([
        {
          user_id: 99,
          username: "alice",
          nickname: "Alice",
          avatar_url: "",
          can_open_direct: true
        }
      ])
    });
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "alice");

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: "add-contact-confirm-99" })
        .props.onPress();
    });

    expect(props.onAddContact).toHaveBeenCalledWith({
      userId: 99,
      remarkName: undefined,
      source: "username"
    });

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  test("already-saved contact shows open-chat + edit-remark actions", async () => {
    const props = createProps({
      onLookupByPhone: jest.fn().mockResolvedValue({
        matched: true,
        phoneE164: "+8613800138000",
        user: {
          user_id: 42,
          username: "bob",
          nickname: "Bob",
          avatar_url: "",
          can_open_direct: true,
          is_already_contact: true
        }
      })
    });
    const renderer = renderScreen(props);
    await typeAndSubmit(renderer.root, "13800138000");

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: "add-contact-edit-remark-42" })
        .props.onPress();
    });

    expect(props.onOpenContactProfile).toHaveBeenCalledWith({
      userId: 42,
      nickname: "Bob",
      avatarUrl: null
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: "add-contact-open-chat-42" })
        .props.onPress();
    });

    expect(props.onOpenChatByUserId).toHaveBeenCalledWith(42);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
