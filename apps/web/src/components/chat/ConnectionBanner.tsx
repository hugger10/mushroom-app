import { Button, Spin } from "antd";
import type { WsUiState } from "../../ws/WSClient";

interface ConnectionBannerProps {
  wsUiState: WsUiState;
  onRetryConnection: () => Promise<void>;
}

export function ConnectionBanner({
  wsUiState,
  onRetryConnection
}: ConnectionBannerProps) {
  if (wsUiState.status === "connected") {
    return null;
  }

  if (wsUiState.status === "offline") {
    return (
      <div className="im-network-banner im-network-banner-offline">
        <div className="im-network-banner-copy">
          <strong>Network disconnected</strong>
          <span>
            Reconnect attempted {wsUiState.maxAttempts} times. Auto reconnect is
            stopped. Please check your network and retry manually.
          </span>
        </div>
        <Button danger onClick={() => void onRetryConnection()}>
          Retry now
        </Button>
      </div>
    );
  }

  return (
    <div className="im-network-banner im-network-banner-reconnecting">
      <div className="im-network-banner-copy">
        <strong>
          <Spin size="small" style={{ marginRight: 8 }} />
          {wsUiState.status === "connecting"
            ? "Connecting to server"
            : "Network unstable, reconnecting"}
        </strong>
        <span>
          {wsUiState.status === "reconnecting"
            ? `Reconnect ${wsUiState.attempt}/${wsUiState.maxAttempts}`
            : "Restoring chat connection, please wait"}
          {wsUiState.nextDelayMs
            ? `, retrying in about ${Math.ceil(wsUiState.nextDelayMs / 1000)}s`
            : ""}
        </span>
      </div>
    </div>
  );
}
