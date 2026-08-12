import { Button, Space } from "antd";
import { useTranslation } from "react-i18next";

interface GroupDangerZoneProps {
  isOwner: boolean;
  loading: boolean;
  onLeave: () => void;
  onDisband: () => void;
}

export default function GroupDangerZone({
  isOwner,
  loading,
  onLeave,
  onDisband
}: GroupDangerZoneProps) {
  const { t } = useTranslation();
  return (
    <Space>
      {isOwner ? (
        <Button danger ghost onClick={onDisband} loading={loading}>
          {t("groupInfo.disbandGroup")}
        </Button>
      ) : null}
      <Button danger onClick={onLeave} loading={loading}>
        {t("groupInfo.leaveGroup")}
      </Button>
    </Space>
  );
}
