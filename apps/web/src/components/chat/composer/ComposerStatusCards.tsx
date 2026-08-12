import { Button } from "antd";
import { CloseCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { getMessageSummaryText } from "@mushroom/shared";
import type { Message } from "../../../types/chat";

interface ReplyPreviewCardProps {
  replyingTo: Message;
  onReplyCancel: () => void;
  getUserDisplayName: (userId: number, fallbackNickname?: string) => string;
}

export function ReplyPreviewCard({
  replyingTo,
  onReplyCancel,
  getUserDisplayName
}: ReplyPreviewCardProps) {
  const { t } = useTranslation();

  return (
    <div className="im-composer-card im-composer-card-reply">
      <div className="im-composer-card-copy">
        <div className="im-composer-card-title im-composer-card-title-reply">
          {t("chat.replyTo", {
            name: getUserDisplayName(
              replyingTo.sender_id,
              replyingTo.sender_nickname
            )
          })}
        </div>
        <div className="im-composer-card-body">
          {getMessageSummaryText(replyingTo.content)}
        </div>
      </div>
      <Button
        type="text"
        size="small"
        icon={<CloseCircleOutlined />}
        onClick={onReplyCancel}
      />
    </div>
  );
}

// NOTE: UploadingFileCard / FailedUploadCard 已废弃。
// 上传中 / 失败 的附件状态现在以消息气泡形态呈现（见 PendingAttachmentBubble），
// 与 WhatsApp / Telegram / WeChat 一致。
