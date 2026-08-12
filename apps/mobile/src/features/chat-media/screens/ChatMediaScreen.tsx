import { useCallback, useEffect, useMemo, useState } from "react";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Text,
  View
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import {
  isFileMessageContent,
  isImageFileMessageContent,
  type MessageFileContent
} from "@mushroom/shared";
import { useAppTheme } from "../../../styles/app-styles";
import { AccountPageShell } from "../../account/AccountPageShell";
import { mobileAppController } from "../../../services/app-runtime";
import type { AppStackParamList } from "../../../types/navigation";
import type { PreviewImageItem } from "../../../app/controller/state/useChatInteractionState";
import { useMediaPreviewActions } from "../../../app/controller/state/MediaPreviewContext";
import {
  FileRow,
  MediaCell,
  buildFileSections,
  buildMediaSections,
  type FileSection,
  type MediaSection
} from "../components";

type ChatMediaTab = "media" | "files";

export function ChatMediaScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "ChatMedia">>();
  const { clientConversationId, title } = route.params;

  const [tab, setTab] = useState<ChatMediaTab>("media");
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [media, setMedia] = useState<MobileMessageSearchResult[]>([]);
  const [files, setFiles] = useState<MobileMessageSearchResult[]>([]);

  const load = useCallback(async () => {
    if (!clientConversationId) {
      return;
    }
    setPending(true);
    setErrorText("");
    try {
      const [nextMedia, nextFiles] = await Promise.all([
        mobileAppController.listAttachmentMessages(
          "media",
          clientConversationId
        ),
        mobileAppController.listAttachmentMessages(
          "files",
          clientConversationId
        )
      ]);
      setMedia(nextMedia);
      setFiles(nextFiles);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err ?? ""));
    } finally {
      setPending(false);
    }
  }, [clientConversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mediaSections: MediaSection[] = useMemo(
    () => buildMediaSections(media),
    [media]
  );

  const fileSections: FileSection[] = useMemo(
    () => buildFileSections(files),
    [files]
  );

  const { openImagePreviewList, setPreviewVideo, openAttachment } =
    useMediaPreviewActions();

  const handleMediaCellPress = useCallback(
    (result: MobileMessageSearchResult) => {
      const rawContent = result.message.content;
      if (!isFileMessageContent(rawContent)) return;

      const fc = rawContent as unknown as MessageFileContent;
      const mime = fc.mime_type ?? "";
      const isImage = mime.startsWith("image/");
      const isVideo = mime.startsWith("video/");

      if (isImage) {
        const imageResults = media.filter(r => {
          const c = r.message.content;
          return isFileMessageContent(c) && isImageFileMessageContent(c);
        });
        const items: PreviewImageItem[] = imageResults.map(r => {
          const rc = r.message.content as unknown as MessageFileContent;
          return {
            url: rc.preview_url || rc.url,
            content: {
              upload_id: rc.upload_id,
              url: rc.url,
              thumb_url: rc.thumb_url,
              preview_url: rc.preview_url,
              message_id:
                r.message.client_message_id ||
                r.message.server_message_id ||
                null
            }
          };
        });
        const startIndex = items.findIndex(
          item => item.content.upload_id === fc.upload_id
        );
        openImagePreviewList(items, startIndex >= 0 ? startIndex : 0);
      } else if (isVideo) {
        const uploadId = fc.upload_id ?? null;
        const messageId =
          result.message.client_message_id ||
          result.message.server_message_id ||
          null;
        setPreviewVideo({
          uri: fc.url,
          uploadId,
          messageId
        });
      }
    },
    [media, openImagePreviewList, setPreviewVideo]
  );

  const headerTitle = title
    ? t("chatMedia.sharedWith", { name: title })
    : t("chatMedia.title");
  const isMediaTab = tab === "media";

  return (
    <AccountPageShell
      title={headerTitle}
      onBack={() => navigation.goBack()}
      testID="chat-media-screen"
    >
      <View style={styles.chatMediaTabBar}>
        <ChatMediaTab
          label={t("chatMedia.mediaCount", { count: media.length })}
          active={isMediaTab}
          onPress={() => setTab("media")}
          styles={styles}
        />
        <ChatMediaTab
          label={t("chatMedia.fileCount", { count: files.length })}
          active={!isMediaTab}
          onPress={() => setTab("files")}
          styles={styles}
        />
      </View>

      {errorText ? (
        <View style={styles.chatMediaErrorBanner}>
          <Text style={styles.chatMediaErrorText}>{errorText}</Text>
        </View>
      ) : null}

      {pending && media.length === 0 && files.length === 0 ? (
        <View style={styles.chatMediaLoadingWrap}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : isMediaTab ? (
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
                      onPress={() => handleMediaCellPress(cell)}
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
          <EmptyHint label={t("chatMedia.noImagesOrVideos")} styles={styles} />
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
              onPress={() => openAttachment(item.message)}
            />
          )}
        />
      ) : (
        <EmptyHint label={t("chatMedia.noFiles")} styles={styles} />
      )}
    </AccountPageShell>
  );
}

function ChatMediaTab(props: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof useAppTheme>["styles"];
}) {
  const { active, label, onPress, styles } = props;
  return (
    <Pressable
      onPress={onPress}
      style={styles.chatMediaTabItem}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.chatMediaTabLabel,
          active ? styles.chatMediaTabLabelActive : null
        ]}
      >
        {label}
      </Text>
      {active ? <View style={styles.chatMediaTabIndicator} /> : null}
    </Pressable>
  );
}

function EmptyHint(props: {
  label: string;
  styles: ReturnType<typeof useAppTheme>["styles"];
}) {
  return (
    <View style={props.styles.chatMediaEmptyWrap}>
      <Text style={props.styles.chatMediaEmptyText}>{props.label}</Text>
    </View>
  );
}
