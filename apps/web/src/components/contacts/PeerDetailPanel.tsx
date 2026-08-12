import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  MessageOutlined,
  PhoneOutlined,
  StopOutlined,
  UserAddOutlined,
  UserOutlined,
  VideoCameraOutlined
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Skeleton
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@mushroom/shared";
import { CONTACT_REMARK_MAX_LENGTH } from "@mushroom/shared";
import {
  blockUser,
  deleteContact,
  getUserProfile,
  saveContact,
  unblockUser,
  updateContact
} from "../../http/api";
import type { ContactListItem } from "../../types/user";
import { normalizeAvatarUrl } from "../../utils/display";
import { getReadableErrorMessage } from "../../utils/errorMessage";
import {
  fetchRemoteContacts,
  fetchRemoteConversations,
  fetchRemoteMessages
} from "../../sync/syncContext";
import { syncRelationshipChanges } from "../../utils/relationshipSync";
import type { Conversation } from "../../types/chat";
import { UserAvatar } from "../avatars/UserAvatar";
import { useAvatarLightbox } from "../avatars/avatarLightboxContext";
import { useResolvedContact } from "./useResolvedContact";

export interface PeerDetailPanelProps {
  /** Target user being inspected. */
  userId: number;
  /** Optional pre-known contact record (used as fallback before profile arrives). */
  contact?: ContactListItem | null;
  /** Optional fallback display name (e.g. from chat header) when profile is loading. */
  fallbackName?: string | null;
  /** Optional fallback avatar URL. */
  fallbackAvatar?: string | null;
  /**
   * Optional override for the target's "is contact" state. If omitted, the
   * panel resolves it from the local contacts cache.
   */
  isContact?: boolean;
  /**
   * Optional override for the target's "is blocked" state. If omitted, the
   * panel resolves it from the local blocked-users cache.
   */
  isBlocked?: boolean;
  /** Render a back button (when used as an overlay panel). */
  showBackButton?: boolean;
  /** Called when the user closes the panel (back button or after destructive action). */
  onClose?: () => void;
  /** Open / focus the direct conversation for this user. Returns the conversation. */
  onSendMessage: (userId: number) => Promise<Conversation | null>;
  /** Start an audio call against the resolved conversation. */
  onStartAudioCall: (conversation: Conversation) => Promise<void>;
  /** Start a video call against the resolved conversation. */
  onStartVideoCall: (conversation: Conversation) => Promise<void>;
  /** Called after the contact is removed/blocked so the parent can refresh. */
  onContactRemoved?: () => void;
  /** Called after the user is added as a contact. */
  onContactAdded?: () => void;
}

function GenderBadge({ gender }: { gender?: number }) {
  const { t } = useTranslation();
  const isMale = gender === 1;
  const isFemale = gender === 2;
  const toneClass = isMale
    ? "im-peer-detail-gender-badge-male"
    : isFemale
      ? "im-peer-detail-gender-badge-female"
      : "im-peer-detail-gender-badge-unknown";
  const label = isMale
    ? t("contacts.profileGenderMale")
    : isFemale
      ? t("contacts.profileGenderFemale")
      : t("contacts.profileGenderUnknown");

  return (
    <span
      className={`im-peer-detail-gender-badge ${toneClass}`}
      aria-label={label}
      title={label}
    >
      <UserOutlined aria-hidden="true" />
    </span>
  );
}

/**
 * WhatsApp-style peer detail surface used both for confirmed contacts (from
 * the contacts tab) and for non-contacts (when tapping an avatar inside a
 * chat). The hero avatar is clickable and opens the AvatarLightbox.
 */
export function PeerDetailPanel({
  userId,
  contact,
  fallbackName,
  fallbackAvatar,
  isContact,
  isBlocked,
  showBackButton,
  onClose,
  onSendMessage,
  onStartAudioCall,
  onStartVideoCall,
  onContactRemoved,
  onContactAdded
}: PeerDetailPanelProps) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkNameDraft, setRemarkNameDraft] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [optimisticRemark, setOptimisticRemark] = useState<{
    name: string;
  } | null>(null);
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const {
    resolvedContact,
    resolvedIsContact,
    resolvedIsBlocked,
    resolvedContactRef
  } = useResolvedContact(userId, contact, isContact, isBlocked);
  const lightbox = useAvatarLightbox();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUserProfile(userId)
      .then(result => {
        if (!cancelled) setProfile(result.data);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = resolvedContactRef.current;
        if (fallback) {
          setProfile({
            id: fallback.user_id,
            username: fallback.username,
            nickname: fallback.nickname,
            avatar_url: fallback.avatar_url,
            gender: fallback.gender,
            signature: fallback.signature
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, resolvedContactRef]);

  const remarkName =
    optimisticRemark?.name ?? (resolvedContact?.remark_name || "");
  const nicknameSource = profile?.nickname || resolvedContact?.nickname || "";

  const displayName = useMemo(() => {
    return (
      remarkName ||
      profile?.nickname ||
      resolvedContact?.nickname ||
      fallbackName ||
      profile?.username ||
      resolvedContact?.username ||
      t("display.unknownUser", { id: userId })
    );
  }, [remarkName, resolvedContact, fallbackName, profile, userId, t]);

  const avatarUrl = normalizeAvatarUrl(
    profile?.avatar_url ?? resolvedContact?.avatar_url ?? fallbackAvatar ?? null
  );

  const signature =
    (profile?.signature || resolvedContact?.signature || "").trim() ||
    t("peerProfile.noSignatureWeb");
  const gender = profile?.gender ?? resolvedContact?.gender ?? 0;
  const username = profile?.username || resolvedContact?.username || "";
  const email = profile?.email || "";
  const phone = profile?.phone || "";

  const handleSendMessage = useCallback(async () => {
    await onSendMessage(userId);
  }, [onSendMessage, userId]);

  const handleStartCall = useCallback(
    async (mode: "audio" | "video") => {
      const conversation = await onSendMessage(userId);
      if (!conversation) return;
      if (mode === "audio") {
        await onStartAudioCall(conversation);
      } else {
        await onStartVideoCall(conversation);
      }
    },
    [onSendMessage, onStartAudioCall, onStartVideoCall, userId]
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteContact(userId);
      await syncRelationshipChanges({
        fetchContacts: fetchRemoteContacts,
        fetchConversations: fetchRemoteConversations,
        fetchMessages: fetchRemoteMessages
      });
      message.success(t("peerProfile.removedFromContacts"));
      onContactRemoved?.();
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("peerProfile.deleteContactFailed"))
      );
    }
  }, [userId, onContactRemoved, message, t]);

  const handleBlock = useCallback(async () => {
    try {
      await blockUser(userId);
      await syncRelationshipChanges({
        fetchContacts: fetchRemoteContacts,
        fetchConversations: fetchRemoteConversations,
        fetchMessages: fetchRemoteMessages
      });
      message.success(t("peerProfile.blocked"));
      onContactRemoved?.();
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("peerProfile.blockFailed"))
      );
    }
  }, [userId, onContactRemoved, message, t]);

  const handleUnblock = useCallback(async () => {
    try {
      await unblockUser(userId);
      await syncRelationshipChanges({
        fetchContacts: fetchRemoteContacts,
        fetchConversations: fetchRemoteConversations,
        fetchMessages: fetchRemoteMessages
      });
      message.success(t("peerProfile.unblocked"));
      onContactAdded?.();
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("peerProfile.unblockFailed"))
      );
    }
  }, [userId, onContactAdded, message, t]);

  const handleAddAsContact = useCallback(async () => {
    setAdding(true);
    try {
      await saveContact(userId);
      await syncRelationshipChanges({
        fetchContacts: fetchRemoteContacts,
        fetchConversations: fetchRemoteConversations,
        fetchMessages: fetchRemoteMessages
      });
      message.success(t("peerProfile.addedAsContact"));
      onContactAdded?.();
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("peerProfile.addContactFailed"))
      );
    } finally {
      setAdding(false);
    }
  }, [userId, onContactAdded, message, t]);

  const openAvatarLightbox = useCallback(() => {
    lightbox.open({ src: avatarUrl, name: displayName });
  }, [avatarUrl, displayName, lightbox]);

  const openRemarkModal = useCallback(() => {
    setRemarkNameDraft(remarkName || "");
    setRemarkModalOpen(true);
  }, [remarkName]);

  const handleSaveRemark = useCallback(async () => {
    const name = remarkNameDraft.trim();
    setRemarkSaving(true);
    try {
      await updateContact(userId, {
        remark_name: name
      });
      setOptimisticRemark({ name });
      message.success(t("contacts.remarkSavedSuccess"));
      setRemarkModalOpen(false);
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("contacts.remarkSaveFailed"))
      );
    } finally {
      setRemarkSaving(false);
    }
  }, [remarkNameDraft, userId, t, message]);

  // Clear optimistic state once WS contact_changed回流 brings server值与本地一致
  useEffect(() => {
    if (!optimisticRemark) return;
    const serverName = resolvedContact?.remark_name || "";
    if (serverName === optimisticRemark.name) {
      setOptimisticRemark(null);
    }
  }, [optimisticRemark, resolvedContact?.remark_name]);

  if (loading && !profile && !resolvedContact) {
    return (
      <div className="im-contact-detail-panel">
        <div className="im-contact-detail-skeleton">
          <Skeleton.Avatar active size={96} shape="square" />
          <Skeleton active paragraph={{ rows: 4 }} title={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="im-contact-detail-panel">
      <div className="im-contact-detail-card">
        <div className="im-contact-detail-card-header">
          {showBackButton ? (
            <Button
              type="text"
              className="im-contact-detail-back-button"
              icon={<ArrowLeftOutlined />}
              onClick={onClose}
              aria-label={t("peerProfile.back")}
            />
          ) : (
            <span className="im-contact-detail-back-spacer" />
          )}

          {resolvedIsContact ? (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "remark",
                    icon: <EditOutlined />,
                    label: t("addContactScreen.editRemark"),
                    onClick: () => openRemarkModal()
                  },
                  {
                    key: "delete",
                    icon: <DeleteOutlined />,
                    label: t("peerProfile.deleteContact"),
                    onClick: () => {
                      Modal.confirm({
                        title: t("peerProfile.deleteContact"),
                        content: t("peerProfile.deleteConfirmBody"),
                        okText: t("peerProfile.deleteConfirmOk"),
                        okButtonProps: { danger: true },
                        cancelText: t("common.cancel"),
                        onOk: () => handleDelete()
                      });
                    }
                  },
                  resolvedIsBlocked
                    ? {
                        key: "unblock",
                        icon: <StopOutlined />,
                        label: t("contacts.profileUnblock"),
                        onClick: () => {
                          Modal.confirm({
                            title: t("contacts.profileUnblock"),
                            content: t("peerProfile.unblockConfirmBody"),
                            okText: t("common.confirm"),
                            cancelText: t("common.cancel"),
                            onOk: () => handleUnblock()
                          });
                        }
                      }
                    : {
                        key: "block",
                        icon: <StopOutlined />,
                        label: t("contacts.profileBlock"),
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: t("peerProfile.blockConfirmTitle"),
                            content: t("peerProfile.blockConfirmBody"),
                            okText: t("peerProfile.blockConfirmOk"),
                            okButtonProps: { danger: true },
                            cancelText: t("common.cancel"),
                            onOk: () => handleBlock()
                          });
                        }
                      }
                ]
              }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Button
                type="text"
                className="im-contact-detail-more-button"
                icon={<EllipsisOutlined />}
              />
            </Dropdown>
          ) : (
            <span />
          )}
        </div>

        <div className="im-contact-detail-avatar-section">
          <button
            type="button"
            className="im-contact-detail-avatar-button"
            onClick={openAvatarLightbox}
            aria-label={t("peerProfile.viewLargeAvatar")}
            title={t("peerProfile.viewLargeAvatar")}
          >
            <UserAvatar
              className="im-contact-detail-avatar"
              size={96}
              src={avatarUrl}
              name={displayName}
              style={{ borderRadius: "50%" }}
            />
          </button>
        </div>

        <div className="im-contact-detail-info">
          <div className="im-contact-detail-name-row">
            <span className="im-contact-detail-name">{displayName}</span>
            <GenderBadge gender={gender} />
          </div>
          {username ? (
            <div className="im-contact-detail-original-nickname">
              @{username}
            </div>
          ) : null}

          <div className="im-contact-detail-meta">
            <div className="im-contact-detail-meta-item">
              <span className="im-contact-detail-meta-label">
                {t("peerProfile.nickname")}
              </span>
              <span className="im-contact-detail-meta-value">
                {nicknameSource || "-"}
              </span>
            </div>
            {resolvedIsContact ? (
              <>
                <div className="im-contact-detail-meta-item">
                  <span className="im-contact-detail-meta-label">
                    {t("contacts.remarkName")}
                  </span>
                  <span className="im-contact-detail-meta-value">
                    {remarkName || "—"}
                  </span>
                </div>
              </>
            ) : null}
            <div className="im-contact-detail-meta-item">
              <span className="im-contact-detail-meta-label">
                {t("contacts.profileLabelPhone")}
              </span>
              <span className="im-contact-detail-meta-value">
                {phone || t("peerProfile.notShared")}
              </span>
            </div>
            <div className="im-contact-detail-meta-item">
              <span className="im-contact-detail-meta-label">
                {t("contacts.profileLabelEmail")}
              </span>
              <span className="im-contact-detail-meta-value">
                {email || t("peerProfile.notShared")}
              </span>
            </div>
            <div className="im-contact-detail-meta-item">
              <span className="im-contact-detail-meta-label">
                {t("peerProfile.signature")}
              </span>
              <span className="im-contact-detail-meta-value im-contact-detail-signature">
                {signature}
              </span>
            </div>
          </div>
        </div>

        {!resolvedIsContact ? (
          <div className="im-contact-detail-stranger-banner">
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              loading={adding}
              onClick={() => void handleAddAsContact()}
            >
              {t("contacts.profileAddAsContact")}
            </Button>
          </div>
        ) : null}

        <div className="im-contact-detail-actions">
          <button
            type="button"
            className="im-contact-detail-action"
            onClick={() => void handleSendMessage()}
          >
            <MessageOutlined />
            <span>{t("contacts.profileActionMessage")}</span>
          </button>
          <button
            type="button"
            className="im-contact-detail-action"
            onClick={() => void handleStartCall("audio")}
          >
            <PhoneOutlined />
            <span>{t("peerProfile.voiceChat")}</span>
          </button>
          <button
            type="button"
            className="im-contact-detail-action"
            onClick={() => void handleStartCall("video")}
          >
            <VideoCameraOutlined />
            <span>{t("peerProfile.videoChat")}</span>
          </button>
        </div>
      </div>
      <Modal
        title={t("addContactScreen.editRemark")}
        open={remarkModalOpen}
        confirmLoading={remarkSaving}
        onOk={() => void handleSaveRemark()}
        onCancel={() => setRemarkModalOpen(false)}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label={t("addContactScreen.remarkLabel")}>
            <Input
              value={remarkNameDraft}
              maxLength={CONTACT_REMARK_MAX_LENGTH}
              showCount
              placeholder={t("addContactScreen.remarkPlaceholder")}
              onChange={event => setRemarkNameDraft(event.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
