import { Button, Input, List, Modal, Space, Tag } from "antd";
import { useTranslation } from "react-i18next";
import {
  getMessageSummaryText,
  SEARCH_KEYWORD_MAX_LENGTH
} from "@mushroom/shared";
import { formatChatTimeUnified } from "../../utils/date";
import type { SearchMessageResult } from "../../types/chat";
import { getMessageDisplayName } from "../../utils/display";

interface WorkspaceSearchModalProps {
  open: boolean;
  keyword: string;
  searching: boolean;
  results: SearchMessageResult[];
  onCancel: () => void;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onOpenMessage: (item: SearchMessageResult) => void;
}

export function WorkspaceSearchModal({
  open,
  keyword,
  searching,
  results,
  onCancel,
  onKeywordChange,
  onSearch,
  onOpenMessage
}: WorkspaceSearchModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      className="im-modal"
      title={t("chatMedia.workspaceTitle")}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={760}
    >
      <Input.Search
        value={keyword}
        onChange={event => onKeywordChange(event.target.value)}
        onSearch={onSearch}
        placeholder={t("chatMedia.workspaceSearchPlaceholder")}
        enterButton={t("chat.searchButton")}
        maxLength={SEARCH_KEYWORD_MAX_LENGTH}
      />
      <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
        {searching
          ? t("chat.searching")
          : keyword.trim()
            ? t("chatMedia.foundResults", { count: results.length })
            : t("chatMedia.workspaceHint")}
      </div>
      <List
        style={{ marginTop: 12 }}
        dataSource={results}
        locale={{
          emptyText: keyword.trim()
            ? t("chatMedia.noResults")
            : t("chatMedia.noSearchYet")
        }}
        renderItem={item => (
          <List.Item
            style={{ cursor: "pointer" }}
            onClick={() => onOpenMessage(item)}
          >
            <List.Item.Meta
              title={
                <Space size={8} wrap>
                  <Tag color="blue">
                    {item.conversation_label || t("chatMedia.conversation")}
                  </Tag>
                  <span>
                    {getMessageDisplayName({
                      message: item,
                      defaultLabel: t("display.unknownMember")
                    })}
                  </span>
                  <span style={{ color: "#999", fontSize: 12 }}>
                    {formatChatTimeUnified(item.created_at)}
                  </span>
                </Space>
              }
              description={getMessageSummaryText(item.content)}
            />
            <Button size="small">{t("chatMedia.open")}</Button>
          </List.Item>
        )}
      />
    </Modal>
  );
}
