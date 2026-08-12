import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ReactNode
} from "react";
import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetModal as BottomSheetModalType
} from "@gorhom/bottom-sheet";
export { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";

export type BottomSheetOption<T extends string | number> = {
  value: T;
  label: string;
  description?: string;
  destructive?: boolean;
  /**
   * Optional Ionicons name. When present, rendered in a soft circular badge
   * before the label, matching the entry-list affordance previously hosted by
   * AddContactSheet.
   */
  icon?: string;
};

type BottomSheetBaseProps = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  testID?: string;
  /**
   * Optional style override for the inner sheet container.
   */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Optional fixed snap points (e.g. `["90%"]`). When provided, dynamic
   * content sizing is disabled and the sheet snaps to these heights instead of
   * measuring its content. Use this for tall, scrollable sheets (e.g. the
   * profile editor) so they don't collapse to a short popup on Android.
   */
  snapPoints?: ReadonlyArray<string | number>;
  /**
   * Passed through to `@gorhom/bottom-sheet`. Controls how the sheet reacts
   * when the keyboard appears (`extend` pushes content above the keyboard).
   */
  keyboardBehavior?: "interactive" | "extend" | "fillParent";
  keyboardBlurBehavior?: "none" | "restore";
  android_keyboardInputMode?: "adjustPan" | "adjustResize";
  /**
   * Passed through to `@gorhom/bottom-sheet`. Raises the sheet container
   * bottom by this many pixels (used to keep a sheet above the keyboard).
   */
  bottomInset?: number;
};

/**
 * BottomSheet primitive (T7 — Phase B).
 *
 * Wraps `@gorhom/bottom-sheet`'s `BottomSheetModal` while preserving the
 * legacy controlled-visibility API (`visible` + `onClose`). This keeps every
 * existing call-site (AddContactSheet, ChatsScreen long-press menu, etc.)
 * working unchanged while moving the underlying animation onto the UI thread
 * and gaining native pan-to-close + keyboard coordination.
 */
export const BottomSheet = forwardRef<
  BottomSheetModalType,
  BottomSheetBaseProps & { children: ReactNode }
>(function BottomSheet(props, ref) {
  const { styles, theme } = useAppTheme();
  const sheetRef = useRef<BottomSheetModalType>(null);
  const setSheetRef = useCallback(
    (node: BottomSheetModalType | null) => {
      sheetRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );
  const lastVisibleRef = useRef<boolean>(false);

  useEffect(() => {
    if (props.visible && !lastVisibleRef.current) {
      sheetRef.current?.present();
    } else if (!props.visible && lastVisibleRef.current) {
      sheetRef.current?.dismiss();
    }
    lastVisibleRef.current = props.visible;
  }, [props.visible]);

  useEffect(() => {
    return () => {
      sheetRef.current?.dismiss();
    };
  }, []);

  const handleDismiss = useCallback(() => {
    // Only propagate when the dismissal was driven by user gesture / backdrop,
    // not by our own programmatic dismiss() (which is already a reaction to
    // the parent setting visible=false).
    if (lastVisibleRef.current) {
      lastVisibleRef.current = false;
      props.onClose();
    }
  }, [props.onClose]);

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.4}
      />
    ),
    []
  );

  // When invisible we still render the modal (it just stays detached) so the
  // ref is always available. Without explicit snapPoints we rely on
  // enableDynamicSizing so gorhom measures the BottomSheetView and snaps to its
  // natural height. With snapPoints we use a fixed-height sheet whose inner
  // BottomSheetView flexes to fill the available space.
  const hasFixedSnap = Boolean(props.snapPoints && props.snapPoints.length > 0);
  return (
    <BottomSheetModal
      ref={setSheetRef}
      enableDynamicSizing={!hasFixedSnap}
      snapPoints={hasFixedSnap ? [...props.snapPoints!] : undefined}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      keyboardBehavior={props.keyboardBehavior}
      keyboardBlurBehavior={props.keyboardBlurBehavior}
      android_keyboardInputMode={props.android_keyboardInputMode}
      bottomInset={props.bottomInset}
      handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
      backgroundStyle={{
        backgroundColor: theme.colors.surfaceStrong,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22
      }}
    >
      <BottomSheetView
        testID={props.testID}
        style={[
          styles.bottomSheetGorhomContent,
          hasFixedSnap ? styles.bottomSheetGorhomContentFill : null,
          props.containerStyle
        ]}
      >
        {props.title ? (
          <Text style={styles.bottomSheetTitle}>{props.title}</Text>
        ) : null}
        {props.children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

export function BottomSheetOptionList<T extends string | number>(props: {
  options: Array<BottomSheetOption<T>>;
  selectedValue?: T;
  onSelect: (value: T) => void;
  testIDPrefix?: string;
}) {
  const { styles, theme } = useAppTheme();

  return (
    <View style={styles.bottomSheetOptionList}>
      {props.options.map((option, index) => {
        const selected = option.value === props.selectedValue;
        return (
          <View key={String(option.value)}>
            {index > 0 ? <View style={styles.bottomSheetSeparator} /> : null}
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => props.onSelect(option.value)}
              style={styles.bottomSheetOptionRow}
              testID={
                props.testIDPrefix
                  ? `${props.testIDPrefix}-${option.value}`
                  : undefined
              }
            >
              {option.icon ? (
                <View style={styles.bottomSheetOptionIconWrap}>
                  <Icon
                    name={option.icon}
                    size={20}
                    color={theme.colors.accent}
                  />
                </View>
              ) : null}
              <View style={styles.bottomSheetOptionMain}>
                <Text
                  style={[
                    styles.bottomSheetOptionLabel,
                    option.destructive ? { color: theme.colors.danger } : null
                  ]}
                >
                  {option.label}
                </Text>
                {option.description ? (
                  <Text style={styles.bottomSheetOptionDescription}>
                    {option.description}
                  </Text>
                ) : null}
              </View>
              {selected ? (
                <Icon
                  name="checkmark"
                  size={22}
                  color={theme.colors.accentStrong}
                />
              ) : null}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
