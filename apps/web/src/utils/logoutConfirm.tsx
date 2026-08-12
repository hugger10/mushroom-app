/* eslint-disable react-refresh/only-export-components */
import { Checkbox, Modal } from "antd";
import { useState, type ReactElement } from "react";
import i18next from "i18next";

type LogoutChoice = {
  confirmed: boolean;
  wipeLocalData: boolean;
};

function tr(key: string, fallback: string): string {
  try {
    const value = i18next.t(key);
    if (typeof value === "string" && value && value !== key) {
      return value;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function WipeCheckbox({
  onChange
}: {
  onChange: (value: boolean) => void;
}): ReactElement {
  const [checked, setChecked] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <Checkbox
        checked={checked}
        onChange={e => {
          setChecked(e.target.checked);
          onChange(e.target.checked);
        }}
      >
        {tr("auth.logoutWipeLocalData", "同时清除本地聊天记录")}
      </Checkbox>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "var(--im-text-soft, #888)",
          lineHeight: 1.5
        }}
      >
        {tr(
          "auth.logoutWipeLocalDataHint",
          "勾选后将删除本机的消息、媒体缓存与偏好；不勾选则仅退出登录，下次仍可恢复本地数据。"
        )}
      </div>
    </div>
  );
}

/**
 * Electron 退出登录确认弹窗。
 * 返回 `{ confirmed: false }` 表示用户取消；
 * `{ confirmed: true, wipeLocalData }` 是否同时清除本地数据。
 */
export function confirmLogout(): Promise<LogoutChoice> {
  return new Promise(resolve => {
    let wipe = false;
    Modal.confirm({
      title: tr("auth.logoutConfirmTitle", "确认退出登录？"),
      content: (
        <div>
          <div>
            {tr(
              "auth.logoutConfirmBody",
              "退出后需要重新输入账号密码才能继续使用。"
            )}
          </div>
          <WipeCheckbox
            onChange={value => {
              wipe = value;
            }}
          />
        </div>
      ),
      okText: tr("common.confirm", "确认退出"),
      cancelText: tr("common.cancel", "取消"),
      okButtonProps: { danger: true },
      onOk: () => {
        resolve({ confirmed: true, wipeLocalData: wipe });
      },
      onCancel: () => {
        resolve({ confirmed: false, wipeLocalData: false });
      }
    });
  });
}
