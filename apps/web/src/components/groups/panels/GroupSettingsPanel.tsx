import { Select } from "antd";
import { useTranslation } from "react-i18next";

type InvitePermission = "all_members" | "admins_only";
type ProfileEditPermission = "admins" | "owner_only";

interface GroupSettingsPanelProps {
  muteAll: boolean;
  invitePermission: InvitePermission;
  profileEditPermission: ProfileEditPermission;
  canToggleMuteAll: boolean;
  canEditGroupSettings: boolean;
  loading: boolean;
  onChangeMuteAll: (value: boolean) => void;
  onChangeInvitePermission: (value: InvitePermission) => void;
  onChangeProfileEditPermission: (value: ProfileEditPermission) => void;
}

export default function GroupSettingsPanel({
  muteAll,
  invitePermission,
  profileEditPermission,
  canToggleMuteAll,
  canEditGroupSettings,
  loading,
  onChangeMuteAll,
  onChangeInvitePermission,
  onChangeProfileEditPermission
}: GroupSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="im-group-attr-block">
        <span className="im-group-attr-label">
          {t("groupInfo.muteAllLabel")}
        </span>
        <Select
          value={muteAll ? "on" : "off"}
          onChange={value => onChangeMuteAll(value === "on")}
          options={[
            { label: t("groupInfo.off"), value: "off" },
            { label: t("groupInfo.on"), value: "on" }
          ]}
          disabled={!canToggleMuteAll || loading}
        />
      </div>
      <div className="im-group-attr-block">
        <span className="im-group-attr-label">
          {t("groupInfo.invitePermissionLabel")}
        </span>
        <Select
          value={invitePermission}
          onChange={value => onChangeInvitePermission(value)}
          options={[
            { label: t("groupInfo.inviteAdminsOnly"), value: "admins_only" },
            { label: t("groupInfo.inviteAllMembers"), value: "all_members" }
          ]}
          disabled={!canEditGroupSettings || loading}
        />
      </div>
      <div className="im-group-attr-block">
        <span className="im-group-attr-label">
          {t("groupInfo.profileEditPermissionLabel")}
        </span>
        <Select
          value={profileEditPermission}
          onChange={value => onChangeProfileEditPermission(value)}
          options={[
            { label: t("groupInfo.adminsCanEdit"), value: "admins" },
            { label: t("groupInfo.ownerOnlyCanEdit"), value: "owner_only" }
          ]}
          disabled={!canEditGroupSettings || loading}
        />
      </div>
    </>
  );
}
