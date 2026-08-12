import { Message } from "@mushroom/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  formatMessageDateLabel,
  type MessageDateLabels
} from "../../../utils/app-ui";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import {
  isDateSeparatorItem,
  type ChatListItem
} from "./MessageListItem.types";

export function useMessageListData(
  activeMessages: Message[],
  searchResults: MobileMessageSearchResult[]
) {
  const { t } = useTranslation();
  const dateSeparatorLabels = useMemo<MessageDateLabels>(
    () => ({
      today: t("chat.dateSeparator.today", "今天"),
      yesterday: t("chat.dateSeparator.yesterday", "昨天"),
      weekdays: [
        t("chat.dateSeparator.weekday0", "周日"),
        t("chat.dateSeparator.weekday1", "周一"),
        t("chat.dateSeparator.weekday2", "周二"),
        t("chat.dateSeparator.weekday3", "周三"),
        t("chat.dateSeparator.weekday4", "周四"),
        t("chat.dateSeparator.weekday5", "周五"),
        t("chat.dateSeparator.weekday6", "周六")
      ] as MessageDateLabels["weekdays"],
      sameYear: t("chat.dateSeparator.sameYear", "{{month}}月{{day}}日"),
      otherYear: t(
        "chat.dateSeparator.otherYear",
        "{{year}}年{{month}}月{{day}}日"
      )
    }),
    [t]
  );

  const listData = useMemo<ChatListItem[]>(() => {
    const out: ChatListItem[] = [];
    const now = new Date();
    let prev: Date | null = null;
    for (const message of activeMessages) {
      const ts = message.created_at ? new Date(message.created_at) : null;
      const valid = ts !== null && !Number.isNaN(ts.getTime());
      const isNewDay =
        valid &&
        (prev === null ||
          prev.getFullYear() !== ts!.getFullYear() ||
          prev.getMonth() !== ts!.getMonth() ||
          prev.getDate() !== ts!.getDate());
      if (isNewDay) {
        const y = ts!.getFullYear();
        const m = String(ts!.getMonth() + 1).padStart(2, "0");
        const d = String(ts!.getDate()).padStart(2, "0");
        out.push({
          __kind: "date-separator",
          key: `date-${y}${m}${d}`,
          label: formatMessageDateLabel(ts!, now, dateSeparatorLabels)
        });
      }
      out.push(message);
      if (valid) prev = ts;
    }
    out.reverse();
    return out;
  }, [activeMessages, dateSeparatorLabels]);

  const searchActiveIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of searchResults) {
      set.add(r.message.client_message_id);
    }
    return set;
  }, [searchResults]);

  // Re-export to encourage callers to keep using the helper from one place.
  return { listData, searchActiveIds, isDateSeparatorItem };
}
