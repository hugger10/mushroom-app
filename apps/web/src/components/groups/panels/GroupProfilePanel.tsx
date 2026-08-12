import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Button, Input, Upload, message } from "antd";
import { CameraOutlined, TeamOutlined } from "@ant-design/icons";
import type { Conversation } from "../../../types/chat";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH
} from "@mushroom/shared";
import { uploadAvatar } from "../../../http/api";
import { getColorFromName } from "../../../utils/conv";

interface GroupProfileAvatarRowProps {
  conversation: Conversation | null;
  groupName: string;
  groupAvatarUrl?: string;
  loading: boolean;
  canEditProfile: boolean;
  onChangeAvatarUrl: (value: string | undefined) => void;
  onUploadingChange: (uploading: boolean) => void;
}

export function GroupProfileAvatarRow({
  conversation,
  groupName,
  groupAvatarUrl,
  loading,
  canEditProfile,
  onChangeAvatarUrl,
  onUploadingChange
}: GroupProfileAvatarRowProps) {
  const { t } = useTranslation();
  return (
    <div className="im-group-profile-row">
      {groupAvatarUrl ? (
        <Avatar src={groupAvatarUrl} size={84}>
          {groupName?.[0]}
        </Avatar>
      ) : (
        <Avatar
          size={84}
          shape="circle"
          style={{
            backgroundColor: getColorFromName(
              String(
                conversation?.client_conversation_id ||
                  conversation?.server_conversation_id ||
                  groupName ||
                  "group"
              )
            ),
            color: "#fff",
            fontSize: 32
          }}
          icon={<TeamOutlined />}
          aria-label={groupName}
        />
      )}
      <div className="im-group-profile-meta">
        <Upload
          accept="image/png,image/jpeg,image/jpg,image/gif"
          showUploadList={false}
          beforeUpload={async file => {
            onUploadingChange(true);
            try {
              const result = await uploadAvatar(file);
              onChangeAvatarUrl(
                result.large || result.medium || result.small || result.original
              );
              message.success(t("groupInfo.avatarUploadSuccess"));
            } catch (error) {
              message.error(
                error instanceof Error
                  ? error.message
                  : t("groupInfo.avatarUploadFailed")
              );
            } finally {
              onUploadingChange(false);
            }
            return false;
          }}
          disabled={!canEditProfile || loading}
        >
          <Button
            className="im-group-secondary-button im-group-upload-button"
            icon={<CameraOutlined />}
            disabled={!canEditProfile || loading}
          >
            {t("groupInfo.changeGroupAvatar")}
          </Button>
        </Upload>
        <span className="im-group-helper">
          {t("groupInfo.avatarFormatsHint")}
        </span>
      </div>
    </div>
  );
}

interface GroupProfileFieldsProps {
  groupName: string;
  groupDescription: string;
  loading: boolean;
  canEditProfile: boolean;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
}

export default function GroupProfileFields({
  groupName,
  groupDescription,
  loading,
  canEditProfile,
  onChangeName,
  onChangeDescription
}: GroupProfileFieldsProps) {
  const { t } = useTranslation();
  return (
    <Fragment>
      <div className="im-group-attr-block">
        <label className="im-group-attr-label" htmlFor="im-group-name">
          {t("groupInfo.groupNameLabelWeb")}
        </label>
        <Input
          id="im-group-name"
          placeholder={t("groupInfo.groupNamePlaceholderWeb")}
          value={groupName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          onChange={event => onChangeName(event.target.value)}
          disabled={!canEditProfile || loading}
        />
      </div>
      <div className="im-group-attr-block">
        <label className="im-group-attr-label" htmlFor="im-group-desc">
          {t("groupInfo.groupDescriptionLabelWeb")}
        </label>
        <Input.TextArea
          id="im-group-desc"
          placeholder={t("groupInfo.groupDescriptionPlaceholderWeb")}
          value={groupDescription}
          maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
          autoSize={{ minRows: 2, maxRows: 4 }}
          onChange={event => onChangeDescription(event.target.value)}
          disabled={!canEditProfile || loading}
        />
      </div>
    </Fragment>
  );
}
