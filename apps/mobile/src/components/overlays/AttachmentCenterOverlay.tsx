import { useMemo } from "react";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { Pressable, SectionList, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState, PrimaryButton, SmallChip } from "../ui";
import { useAppTheme } from "../../styles/app-styles";
import type { AttachmentTab } from "../../types/app";
import {
  FileRow,
  MediaCell,
  buildFileSections,
  buildMediaSections
} from "../../features/chat-media/components";

export function AttachmentCenterOverlay(props: {
  visible: boolean;
  pending: boolean;
  attachmentTab: AttachmentTab;
  attachmentItems: {
    media: MobileMessageSearchResult[];
    files: MobileMessageSearchResult[];
  };
  onRefresh: () => void;
  onClose: () => void;
  onChangeTab: (tab: AttachmentTab) => void;
  onOpenResult: (
    result: MobileMessageSearchResult,
    previewMedia?: boolean
  ) => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();

  const mediaSections = useMemo(
    () => buildMediaSections(props.attachmentItems.media),
    [props.attachmentItems.media]
  );
  const fileSections = useMemo(
    () => buildFileSections(props.attachmentItems.files),
    [props.attachmentItems.files]
  );

  if (!props.visible) {
    return null;
  }

  const headerTitle = t("chatMedia.attachmentCenter");

  const isMediaTab = props.attachmentTab === "media";

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.overlayBackdrop} onPress={props.onClose} />
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderMain}>
            <Text style={styles.modalTitle}>{headerTitle}</Text>
          </View>
          <PrimaryButton
            label={
              props.pending ? t("chatMedia.refreshing") : t("common.refresh")
            }
            tone="secondary"
            compact
            onPress={props.onRefresh}
          />
        </View>
        <View style={styles.inlineTabRow}>
          <SmallChip
            label={t("chatMedia.mediaCount", {
              count: props.attachmentItems.media.length
            })}
            active={isMediaTab}
            onPress={() => props.onChangeTab("media")}
          />
          <SmallChip
            label={t("chatMedia.fileCount", {
              count: props.attachmentItems.files.length
            })}
            active={props.attachmentTab === "files"}
            onPress={() => props.onChangeTab("files")}
          />
          <SmallChip label={t("common.close")} onPress={props.onClose} />
        </View>

        {isMediaTab ? (
          mediaSections.length > 0 ? (
            <SectionList
              style={styles.flexList}
              sections={mediaSections}
              keyExtractor={(row, rowIndex) =>
                `media-row:${rowIndex}:${row
                  .map((item, cellIndex) =>
                    item
                      ? `${cellIndex}:${item.message.client_message_id}`
                      : `${cellIndex}:empty`
                  )
                  .join("|")}`
              }
              stickySectionHeadersEnabled
              renderSectionHeader={({ section }) => (
                <View style={styles.chatMediaSectionHeader}>
                  <Text style={styles.chatMediaSectionHeaderText}>
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({ item: row }) => (
                <View style={styles.chatMediaGridRow}>
                  {row.map((cell, index) =>
                    cell ? (
                      <MediaCell
                        key={`cell:${cell.message.client_message_id}`}
                        result={cell}
                        styles={styles}
                        theme={theme}
                        onPress={() => props.onOpenResult(cell, true)}
                      />
                    ) : (
                      <View
                        key={`cell-empty:${index}`}
                        style={styles.chatMediaCellPlaceholder}
                      />
                    )
                  )}
                </View>
              )}
            />
          ) : (
            <EmptyState label={t("chatMedia.noImagesOrVideos")} />
          )
        ) : fileSections.length > 0 ? (
          <SectionList
            style={styles.flexList}
            sections={fileSections}
            keyExtractor={item => `file:${item.message.client_message_id}`}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={styles.chatMediaSectionHeader}>
                <Text style={styles.chatMediaSectionHeaderText}>
                  {section.title}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <FileRow
                result={item}
                styles={styles}
                theme={theme}
                onPress={() => props.onOpenResult(item)}
              />
            )}
          />
        ) : (
          <EmptyState label={t("chatMedia.noFiles")} />
        )}
      </View>
    </View>
  );
}
