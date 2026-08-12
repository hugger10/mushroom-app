export function resolveMobileWebSocketUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  if (normalizedBaseUrl.startsWith("https://")) {
    return normalizedBaseUrl.replace(/^https:\/\//, "wss://") + "/ws";
  }
  if (normalizedBaseUrl.startsWith("http://")) {
    return normalizedBaseUrl.replace(/^http:\/\//, "ws://") + "/ws";
  }
  return `ws://${normalizedBaseUrl.replace(/^ws:\/\//, "").replace(/^wss:\/\//, "")}/ws`;
}
