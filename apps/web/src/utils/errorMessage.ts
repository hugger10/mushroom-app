import { i18n } from "../i18n";

export function getReadableErrorMessage(
  error: unknown,
  fallback = i18n.t("errorMessage.fallback")
) {
  const rawMessage =
    error instanceof Error ? error.message.trim() : String(error ?? "").trim();

  if (!rawMessage) {
    return fallback;
  }

  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("user not found")) {
    return i18n.t("errorMessage.userNotFound");
  }

  if (normalized.includes("password is incorrect")) {
    return i18n.t("errorMessage.passwordIncorrect");
  }

  if (normalized.includes("user already exists")) {
    return i18n.t("errorMessage.userAlreadyExists");
  }

  if (normalized.includes("cannot start a direct conversation with yourself")) {
    return i18n.t("errorMessage.cannotStartSelfChat");
  }

  if (normalized.includes("missing user")) {
    return i18n.t("errorMessage.missingUser");
  }

  if (normalized.includes("cannot delete yourself from contacts")) {
    return i18n.t("errorMessage.cannotDeleteSelf");
  }

  if (normalized.includes("unable to start a direct conversation")) {
    return i18n.t("errorMessage.cannotStartDirectBlocked");
  }

  if (normalized.includes("user is not blocked")) {
    return i18n.t("errorMessage.userNotBlocked");
  }

  if (normalized.includes("direct conversation already exists")) {
    return i18n.t("errorMessage.directAlreadyExists");
  }

  if (normalized.includes("member role is already up to date")) {
    return i18n.t("errorMessage.memberRoleUpToDate");
  }

  if (normalized.includes("target member is already the group owner")) {
    return i18n.t("errorMessage.alreadyGroupOwner");
  }

  if (normalized.includes("call already ended")) {
    return i18n.t("errorMessage.callAlreadyEnded");
  }

  if (normalized.includes("another device already joined this call")) {
    return i18n.t("errorMessage.callJoinedElsewhere");
  }

  if (normalized.includes("attachment upload is invalid or already used")) {
    return i18n.t("errorMessage.attachmentInvalid");
  }

  if (
    normalized.includes("video thumbnail upload is invalid or already used")
  ) {
    return i18n.t("errorMessage.videoThumbnailInvalid");
  }

  if (normalized.includes("unauthorized") || normalized.includes("token")) {
    return i18n.t("errorMessage.unauthorized");
  }

  if (normalized.includes("device has been disabled")) {
    return i18n.t("errorMessage.deviceDisabled");
  }

  if (normalized.includes("device session has been revoked")) {
    return i18n.t("errorMessage.deviceSessionRevoked");
  }

  if (normalized.includes("refresh token")) {
    return i18n.t("errorMessage.refreshTokenInvalid");
  }

  if (normalized.includes("session has been revoked")) {
    return i18n.t("errorMessage.sessionRevoked");
  }

  if (normalized.includes("network") || normalized.includes("fetch")) {
    return i18n.t("errorMessage.networkError");
  }

  if (normalized.includes("timeout")) {
    return i18n.t("errorMessage.timeout");
  }

  if (normalized.includes("request failed with status 500")) {
    return i18n.t("errorMessage.server500");
  }

  if (normalized.includes("database_unavailable")) {
    return i18n.t("errorMessage.databaseUnavailable");
  }

  if (normalized.includes("server is still starting")) {
    return i18n.t("errorMessage.serverStarting");
  }

  return rawMessage;
}
