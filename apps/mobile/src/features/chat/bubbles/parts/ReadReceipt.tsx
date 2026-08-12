import { memo } from "react";
import { ActivityIndicator, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../../styles/app-styles";

/**
 * 消息发送/已读状态指示器。
 *
 * status 语义：
 * - 1: 正在发送（ActivityIndicator）
 * - 2: 已写入本地、等待服务端确认（time-outline 图标）
 * - >2: 已被对方接收，结合 `read` 决定显示双勾或单勾
 */
export const ReadReceipt = memo(function ReadReceipt(props: {
  status: number;
  read: boolean;
  color: string;
}) {
  const { styles } = useAppTheme();

  if (props.status === 1) {
    return (
      <View style={styles.readReceiptWrap} testID="message-status-sending">
        <ActivityIndicator size={10} color={props.color} />
      </View>
    );
  }

  if (props.status === 2) {
    return (
      <View style={styles.readReceiptWrap} testID="message-status-pending">
        <Ionicons name="time-outline" size={14} color={props.color} />
      </View>
    );
  }

  if (props.status > 2) {
    return null;
  }

  return (
    <View
      style={styles.readReceiptWrap}
      testID={
        props.read
          ? "message-read-receipt-read"
          : "message-read-receipt-delivered"
      }
    >
      <Ionicons
        name={props.read ? "checkmark-done" : "checkmark"}
        size={14}
        color={props.color}
      />
    </View>
  );
});
