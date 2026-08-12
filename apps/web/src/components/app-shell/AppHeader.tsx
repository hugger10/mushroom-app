import { Button, Popover } from "antd";
import mushroomLogo from "../../assets/mushroom-logo.svg";
import type { LoginUser } from "../../types/user";
import { normalizeAvatarUrl } from "../../utils/display";
import { UserAvatar } from "../avatars/UserAvatar";

interface AppHeaderProps {
  loginUser: LoginUser | null;
  variant: "logo" | "actions";
  onOpenSystemStatus: () => void;
}

export function AppHeader({
  loginUser,
  variant,
  onOpenSystemStatus
}: AppHeaderProps) {
  const avatarUrl = normalizeAvatarUrl(loginUser?.avatar);

  if (variant === "logo") {
    return (
      <Button
        className="im-conversation-rail-button im-rail-tab-button im-rail-brand-button"
        onClick={onOpenSystemStatus}
      >
        <img
          src={mushroomLogo}
          alt=""
          aria-hidden="true"
          className="im-rail-brand-logo"
        />
      </Button>
    );
  }

  return (
    <div className="im-app-rail">
      <div className="im-app-rail-actions">
        <Popover
          content={
            avatarUrl ? (
              <div style={{ textAlign: "center", padding: 8 }}>
                <img
                  src={avatarUrl}
                  alt={loginUser?.nickname || loginUser?.username || "User"}
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: "50%",
                    objectFit: "cover"
                  }}
                />
                {loginUser?.nickname && (
                  <div style={{ marginTop: 8, fontWeight: 500 }}>
                    {loginUser.nickname}
                  </div>
                )}
              </div>
            ) : null
          }
          trigger="click"
          placement="rightTop"
          arrow={false}
        >
          <Button className="im-app-user-button" type="text">
            <UserAvatar
              className="im-app-user-avatar"
              src={loginUser?.avatar ?? null}
              name={loginUser?.nickname || loginUser?.username || "User"}
            />
          </Button>
        </Popover>
      </div>
    </div>
  );
}
