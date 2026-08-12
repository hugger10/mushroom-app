import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { SearchOutlined, CloseOutlined } from "@ant-design/icons";
import { useState, useMemo, useCallback, useRef } from "react";
import { getMessageSummaryText } from "@mushroom/shared";
import { MAX_TEXT_LENGTH, SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import type { Conversation, Message } from "../../types/chat";
import type { BatchForwardMode } from "../../hooks/chat/useMessageSelection";
import { ConversationAvatar } from "../avatars/ConversationAvatar";
import { UserAvatar } from "../avatars/UserAvatar";
import { EmojiPicker } from "./composer/EmojiPicker";
import { formatMessageTime } from "../../utils/date";

interface ForwardMessageModalProps {
  open: boolean;
  message?: Message | null;
  batchMode?: BatchForwardMode | null;
  batchCount?: number;
  selectedMessages?: Message[];
  conversations: Conversation[];
  forwardingToConversationId: string | null;
  onCancel: () => void;
  onForward: (conversationId: string, extraMessage?: string) => Promise<void>;
}

export function ForwardMessageModal({
  open,
  message,
  batchMode,
  batchCount = 0,
  selectedMessages = [],
  conversations,
  forwardingToConversationId,
  onCancel,
  onForward
}: ForwardMessageModalProps) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extraMessage, setExtraMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBatch = batchMode != null;
  const previewText = isBatch
    ? batchMode === "merged"
      ? t("chatMessage.forwardMergedPreview", { count: batchCount })
      : t("chatMessage.forwardOneByOnePreview", { count: batchCount })
    : message
      ? getMessageSummaryText(message.content)
      : "";

  const filteredList = useMemo(() => {
    if (!searchText.trim()) return conversations;
    const keyword = searchText.trim().toLowerCase();
    return conversations.filter(c => {
      const name = (c.display_name || c.name || "").toLowerCase();
      return name.includes(keyword);
    });
  }, [conversations, searchText]);

  const selectedConversation = selectedId
    ? (conversations.find(c => c.client_conversation_id === selectedId) ?? null)
    : null;

  const handleSelect = useCallback((conversationId: string) => {
    setSelectedId(prev => (prev === conversationId ? null : conversationId));
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => {
    setExtraMessage(prev => prev + emoji);
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedId) return;
    await onForward(selectedId, extraMessage.trim() || undefined);
    setSelectedId(null);
    setSearchText("");
    setExtraMessage("");
  }, [selectedId, onForward, extraMessage]);

  const handleCancel = useCallback(() => {
    setSelectedId(null);
    setSearchText("");
    setExtraMessage("");
    setPreviewOpen(false);
    onCancel();
  }, [onCancel]);

  const canSend = selectedId != null && !forwardingToConversationId;

  // Messages to show in the preview modal
  const previewMessages = useMemo(
    () => (isBatch ? selectedMessages : message ? [message] : []),
    [isBatch, selectedMessages, message]
  );

  const previewTitle = useMemo(() => {
    const senderNames = new Set<string>();
    for (const msg of previewMessages) {
      senderNames.add(
        msg.sender_nickname || t("display.unknownUser", { id: msg.sender_id })
      );
    }
    const names = Array.from(senderNames);
    return names.length === 1
      ? t("display.forwardTitleSingle", { name: names[0] })
      : names.length === 2
        ? t("display.forwardTitleTwo", { nameA: names[0], nameB: names[1] })
        : t("display.forwardTitleGroup");
  }, [previewMessages, t]);

  return (
    <>
      <Modal
        className="im-modal im-forward-modal"
        title={null}
        open={open}
        onCancel={handleCancel}
        footer={null}
        width={640}
        centered
        destroyOnHidden
      >
        <div className="im-fwd-container">
          {/* Left panel */}
          <div className="im-fwd-left">
            <div className="im-fwd-search">
              <div className="im-fwd-search-box">
                <SearchOutlined className="im-fwd-search-icon" />
                <input
                  className="im-fwd-search-input"
                  placeholder={t("conversationList.searchPlaceholder")}
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  maxLength={SEARCH_KEYWORD_MAX_LENGTH}
                />
                {searchText ? (
                  <button
                    className="im-fwd-search-clear"
                    onClick={() => setSearchText("")}
                  >
                    <CloseOutlined style={{ fontSize: 10 }} />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="im-fwd-list">
              {filteredList.length === 0 ? (
                <div className="im-fwd-empty">
                  {t("chatMessage.noMatching")}
                </div>
              ) : (
                filteredList.map(conversation => {
                  const id = conversation.client_conversation_id;
                  const name =
                    conversation.display_name || conversation.name || "";
                  const isChecked = selectedId === id;
                  return (
                    <div
                      key={id}
                      className={`im-fwd-row ${isChecked ? "im-fwd-row-checked" : ""}`}
                      onClick={() => handleSelect(id)}
                    >
                      <div
                        className={`im-fwd-check ${isChecked ? "im-fwd-check-active" : ""}`}
                      >
                        {isChecked ? (
                          <svg width="11" height="11" viewBox="0 0 12 12">
                            <path
                              d="M2.5 6L5 8.5L9.5 3.5"
                              stroke="#fff"
                              strokeWidth="2"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </div>
                      <ConversationAvatar
                        conversation={conversation}
                        size={36}
                      />
                      <span className="im-fwd-row-name">{name}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="im-fwd-right">
            <div className="im-fwd-right-title">
              {selectedConversation
                ? t("chatMessage.sendTo", {
                    name:
                      selectedConversation.display_name ||
                      selectedConversation.name ||
                      ""
                  })
                : t("chatMessage.selectConversation")}
            </div>
            <div className="im-fwd-selected-list">
              {selectedConversation ? (
                <div className="im-fwd-selected-row">
                  <ConversationAvatar
                    conversation={selectedConversation}
                    size={28}
                  />
                  <span className="im-fwd-selected-name">
                    {selectedConversation.display_name ||
                      selectedConversation.name ||
                      ""}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Preview + extra message input */}
            <div className="im-fwd-bottom-area">
              {previewText ? (
                <div
                  className="im-fwd-preview-card"
                  onClick={() => setPreviewOpen(true)}
                  title={t("chatMessage.previewTitle")}
                >
                  <span className="im-fwd-preview-text">{previewText}</span>
                  <span className="im-fwd-preview-arrow">
                    {t("chatMessage.view")}
                  </span>
                </div>
              ) : null}
              <div className="im-fwd-extra-input-wrap">
                <input
                  ref={inputRef}
                  className="im-fwd-extra-input"
                  placeholder={t("chatMessage.leaveMessage")}
                  value={extraMessage}
                  onChange={e => setExtraMessage(e.target.value)}
                  maxLength={MAX_TEXT_LENGTH}
                  onKeyDown={e => {
                    if (e.key === "Enter" && canSend) {
                      void handleSend();
                    }
                  }}
                />
                <EmojiPicker onEmojiSelect={handleEmojiSelect} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="im-fwd-footer">
          <button
            className="im-fwd-btn im-fwd-btn-cancel"
            onClick={handleCancel}
          >
            {t("common.cancel")}
          </button>
          <button
            className={`im-fwd-btn im-fwd-btn-send ${canSend ? "" : "im-fwd-btn-disabled"}`}
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            {forwardingToConversationId
              ? t("chatMessage.sending")
              : t("chat.send")}
          </button>
        </div>
      </Modal>

      {/* Preview modal - shows all selected messages */}
      <Modal
        className="im-modal im-fwd-preview-modal"
        title={previewTitle}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={420}
        centered
        zIndex={1100}
      >
        <div className="im-fwd-preview-list">
          {previewMessages.map(msg => (
            <div key={msg.client_message_id} className="im-fwd-preview-item">
              <UserAvatar
                size={32}
                src={msg.sender_avatar}
                name={
                  msg.sender_nickname ||
                  t("display.unknownUser", { id: msg.sender_id })
                }
                className="im-fwd-preview-item-avatar"
              />
              <div className="im-fwd-preview-item-content">
                <div className="im-fwd-preview-item-header">
                  <span className="im-fwd-preview-item-sender">
                    {msg.sender_nickname ||
                      t("display.unknownUser", { id: msg.sender_id })}
                  </span>
                  <span className="im-fwd-preview-item-time">
                    {formatMessageTime(msg.created_at)}
                  </span>
                </div>
                <div className="im-fwd-preview-item-body">
                  {getMessageSummaryText(msg.content)}
                </div>
              </div>
            </div>
          ))}
          {previewMessages.length === 0 ? (
            <div className="im-fwd-empty">
              {t("conversationList.previewEmpty")}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
