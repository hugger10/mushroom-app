import { Input } from "antd";
import { useTranslation } from "react-i18next";
import { GROUP_ANNOUNCEMENT_MAX_LENGTH } from "@mushroom/shared";

interface GroupAnnouncementPanelProps {
  value: string;
  loading: boolean;
  canUpdate: boolean;
  onChange: (value: string) => void;
}

export default function GroupAnnouncementPanel({
  value,
  loading,
  canUpdate,
  onChange
}: GroupAnnouncementPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="im-group-attr-block im-group-attr-block-wide">
      <label className="im-group-attr-label" htmlFor="im-group-announcement">
        {t("groupInfo.announcement")}
      </label>
      <Input.TextArea
        id="im-group-announcement"
        placeholder={t("groupInfo.announcementPlaceholder")}
        value={value}
        maxLength={GROUP_ANNOUNCEMENT_MAX_LENGTH}
        autoSize={{ minRows: 3, maxRows: 5 }}
        onChange={event => onChange(event.target.value)}
        disabled={!canUpdate || loading}
      />
    </div>
  );
}
