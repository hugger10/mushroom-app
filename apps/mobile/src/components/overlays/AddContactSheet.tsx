import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  BottomSheet,
  BottomSheetOptionList,
  type BottomSheetOption
} from "../ui";
import type { AppStackParamList } from "../../types/navigation";

type Navigation = NativeStackNavigationProp<AppStackParamList>;

type EntryKey = "add-contact" | "from-address-book" | "scan-qr";

export function AddContactSheet(props: {
  visible: boolean;
  onClose: () => void;
  onOpenQRScanner: () => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<Navigation>();

  const options = useMemo<Array<BottomSheetOption<EntryKey>>>(
    () => [
      {
        value: "add-contact",
        label: t("addContactEntry.addContactTitle"),
        description: t("addContactEntry.addContactSubtitle"),
        icon: "person-add-outline"
      },
      {
        value: "from-address-book",
        label: t("addContactEntry.fromAddressBookTitle"),
        description: t("addContactEntry.fromAddressBookSubtitle"),
        icon: "people-outline"
      },
      {
        value: "scan-qr",
        label: t("addContactEntry.scanQrTitle"),
        description: t("addContactEntry.scanQrSubtitle"),
        icon: "scan-outline"
      }
    ],
    [t]
  );

  function handleSelect(value: EntryKey) {
    // Close first so the sheet animates out; native-stack push / next Modal
    // open are dispatched synchronously without the historical InteractionManager
    // workaround (verified: ChatsScreen action sheet uses the same pattern).
    props.onClose();
    switch (value) {
      case "add-contact":
        navigation.navigate("AddContact");
        return;
      case "from-address-book":
        navigation.navigate("AddressBookMatchList");
        return;
      case "scan-qr":
        props.onOpenQRScanner();
        return;
      default:
        return;
    }
  }

  return (
    <BottomSheet
      visible={props.visible}
      title={t("addContactEntry.title")}
      onClose={props.onClose}
      testID="add-contact-sheet"
    >
      <BottomSheetOptionList<EntryKey>
        options={options}
        onSelect={handleSelect}
        testIDPrefix="add-contact-entry"
      />
    </BottomSheet>
  );
}
