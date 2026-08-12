import type {
  UpdateUserPrivacySettingsRequest,
  UserPrivacySettings,
  UserPrivacySettingsEnvelope
} from "@mushroom/shared";
import { applyPrivacyVersion, isReadReceiptsEnabled } from "@mushroom/shared";
import type { ControllerContext } from "../context";

/**
 * 本机已读回执隐私视图（version-gated）。详见原 controller 的字段注释。
 */
export class PrivacyService {
  private currentReceiptsEnabled = true;
  private currentPrivacyVersion = -1;

  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  isReceiptsEnabled() {
    return this.currentReceiptsEnabled;
  }

  async getPrivacySettings(): Promise<UserPrivacySettingsEnvelope> {
    const result = await this.ctx.api.getPrivacySettings();
    this.ingestPrivacyEnvelope(result.data);
    return result.data;
  }

  async updatePrivacySettings(
    patch: UpdateUserPrivacySettingsRequest
  ): Promise<UserPrivacySettingsEnvelope> {
    const result = await this.ctx.api.updatePrivacySettings(patch);
    this.ingestPrivacyEnvelope(result.data);
    return result.data;
  }

  /**
   * Public API for hosts to surface their own privacy switches into core
   * without coupling to the full envelope. Bypasses version gating
   * intentionally — caller is the source of truth.
   */
  setReceiptsEnabled(enabled: boolean): void {
    if (this.currentReceiptsEnabled === enabled) return;
    this.currentReceiptsEnabled = enabled;
    if (!enabled) {
      void this.clearAllGroupReadStateForPrivacyOff();
    }
  }

  /**
   * Reconcile an inbound `privacy_sync` WS frame against the cached envelope.
   * Returns true if any visible state changed.
   */
  applyPrivacySyncFrame(frame: {
    settings: UserPrivacySettings;
    version: number;
    updated_at: string;
  }): boolean {
    const baseline: UserPrivacySettingsEnvelope | null =
      this.currentPrivacyVersion >= 0
        ? {
            settings: {
              discoverable_by_username: 0,
              discoverable_by_phone: 0,
              message_permission: 0,
              presence_visibility: 0,
              read_receipts_visibility: this.currentReceiptsEnabled ? 0 : 2
            },
            version: this.currentPrivacyVersion,
            updated_at: ""
          }
        : null;
    const next = applyPrivacyVersion(baseline, frame);
    if (next === baseline) {
      return false;
    }
    this.ingestPrivacyEnvelope(next);
    return true;
  }

  private ingestPrivacyEnvelope(envelope: UserPrivacySettingsEnvelope) {
    this.currentPrivacyVersion = envelope.version;
    const nextEnabled = isReadReceiptsEnabled(envelope.settings);
    if (nextEnabled === this.currentReceiptsEnabled) return;
    this.currentReceiptsEnabled = nextEnabled;
    if (!nextEnabled) {
      void this.clearAllGroupReadStateForPrivacyOff();
    }
  }

  private async clearAllGroupReadStateForPrivacyOff(): Promise<void> {
    const repo = this.ctx.getRepository();
    const clear = repo.clearAllGroupReadStates?.bind(repo);
    if (!clear) return;
    try {
      await clear();
      await this.ctx.publishSnapshot();
    } catch (err) {
      // Cache wipe failure is non-fatal; next refresh self-heals.
      void err;
    }
  }
}
