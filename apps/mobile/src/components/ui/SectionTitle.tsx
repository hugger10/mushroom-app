import { Text, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

export function SectionTitle(props: { title: string; caption?: string }) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.caption ? (
        <Text style={styles.sectionCaption}>{props.caption}</Text>
      ) : null}
    </View>
  );
}
