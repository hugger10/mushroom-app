import { useEffect, useState } from "react";
import { Button, Checkbox, Space } from "antd";
import { useTranslation } from "react-i18next";

export interface PendingImagePreviewCardProps {
  file: File;
  sendAsOriginal: boolean;
  disabled?: boolean;
  onToggleOriginal: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 桌面端"图片待发送"预览面板（对齐微信桌面"选图 → 预览 → 发送"两步流程）。
 *
 * - 显示缩略图、文件名、大小；
 * - "原图（xxMB）"勾选框只在预览面板内出现，关闭面板即丢弃，
 *   不再常驻 Composer 主行；
 * - 仅用于图片类附件，其他类型仍走"选完即发"。
 */
export function PendingImagePreviewCard({
  file,
  sendAsOriginal,
  disabled,
  onToggleOriginal,
  onCancel,
  onConfirm
}: PendingImagePreviewCardProps) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

  return (
    <div className="im-composer-card im-composer-card-pending-image">
      <div className="im-composer-pending-image-main">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={file.name}
            className="im-composer-pending-image-thumb"
          />
        ) : (
          <div className="im-composer-pending-image-thumb" />
        )}
        <div className="im-composer-pending-image-meta">
          <div className="im-composer-pending-image-name" title={file.name}>
            {file.name}
          </div>
          <div className="im-composer-pending-image-size">{sizeMB} MB</div>
          <Checkbox
            className="im-composer-pending-image-original"
            checked={sendAsOriginal}
            disabled={disabled}
            onChange={e => onToggleOriginal(e.target.checked)}
          >
            {t("chat.sendAsOriginalWithSize", { size: sizeMB })}
          </Checkbox>
        </div>
      </div>
      <Space>
        <Button size="small" onClick={onCancel} disabled={disabled}>
          {t("common.cancel")}
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={onConfirm}
          disabled={disabled}
        >
          {t("chat.send")}
        </Button>
      </Space>
    </div>
  );
}
