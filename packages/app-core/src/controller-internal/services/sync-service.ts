import { runMobileSync } from "../../sync";
import type { ControllerContext } from "../context";
import type { MobileAppSnapshot } from "../../types";
import type { SyncNowOptions } from "../internal-helpers";
import { isUnauthorizedError } from "../internal-helpers";

/**
 * SyncService 持有同步触发的并发原语：
 *  - syncNowInflight + syncNowPending + syncNowPendingOptions：去重 + replay
 *  - unauthorizedRecovery：401 单飞
 *
 * 同时负责 logout / handleUnauthorizedSession（与 auth 共享 clearLocalSession）。
 */
export class SyncService {
  private syncNowInflight: Promise<MobileAppSnapshot> | null = null;
  private syncNowPending = false;
  private syncNowPendingOptions: SyncNowOptions | undefined = undefined;
  private unauthorizedRecovery: Promise<MobileAppSnapshot> | null = null;

  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async syncNow(options?: SyncNowOptions) {
    // 多触发源去重 + replay
    if (this.syncNowInflight) {
      this.syncNowPending = true;
      if (options?.force) {
        this.syncNowPendingOptions = {
          ...(this.syncNowPendingOptions ?? {}),
          force: true
        };
      } else if (!this.syncNowPendingOptions) {
        this.syncNowPendingOptions = options;
      }
      return this.syncNowInflight;
    }

    let resolveOuter!: (snapshot: MobileAppSnapshot) => void;
    let rejectOuter!: (error: unknown) => void;
    const outer = new Promise<MobileAppSnapshot>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });
    outer.catch(() => undefined);
    this.syncNowInflight = outer;

    try {
      let lastSnapshot: MobileAppSnapshot | undefined;
      let isReplay = false;
      do {
        this.syncNowPending = false;
        const replayOptions = this.syncNowPendingOptions;
        this.syncNowPendingOptions = undefined;
        const effectiveOptions = isReplay ? replayOptions : options;
        lastSnapshot = await this.runSyncNow(effectiveOptions);
        isReplay = true;
      } while (this.syncNowPending);
      resolveOuter(lastSnapshot as MobileAppSnapshot);
      return lastSnapshot;
    } catch (error) {
      rejectOuter(error);
      throw error;
    } finally {
      this.syncNowInflight = null;
    }
  }

  private async runSyncNow(options?: SyncNowOptions) {
    const auth = await this.ctx.getAuthStore().read();
    if (!auth.accessToken) {
      return this.ctx.publishSnapshot();
    }

    // Flip syncing:true and emit immediately so the UI can show a skeleton.
    this.ctx.setMetrics({ ...this.ctx.getMetrics(), syncing: true });
    await this.ctx.publishSnapshot();

    let handledByUnauthorized = false;

    try {
      const nextMetrics = await runMobileSync({
        api: this.ctx.api,
        repository: this.ctx.getRepository(),
        checkpoints: this.ctx.getCheckpoints(),
        force: options?.force,
        onStageComplete: async stage => {
          if (stage === "contacts" || stage === "conversations") {
            await this.ctx.publishSnapshot();
          }
        }
      });
      this.ctx.setMetrics({ ...nextMetrics, syncing: true });

      const activeId = this.ctx.getActiveConversationId();
      if (activeId) {
        await this.ctx.services.readReceipt.scheduleConversationRead(activeId, {
          notify: false
        });
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handledByUnauthorized = true;
        return this.handleUnauthorizedSession();
      }
      throw error;
    } finally {
      if (!handledByUnauthorized) {
        this.ctx.setMetrics({ ...this.ctx.getMetrics(), syncing: false });
        await this.ctx.publishSnapshot();
      }
    }

    return this.ctx.publishSnapshot();
  }

  async handleUnauthorizedSession() {
    if (!this.unauthorizedRecovery) {
      // Server invalidated session: keep local SQL + sync checkpoints so the
      // next login renders cached data immediately. Only drop credentials.
      this.unauthorizedRecovery = this.ctx.services.auth
        .clearLocalSession({ wipeLocalData: false })
        .finally(() => {
          this.unauthorizedRecovery = null;
        });
    }
    return this.unauthorizedRecovery;
  }

  async logout(options?: { wipeLocalData?: boolean }) {
    // unregister 必须在 logout 前完成（详见原 controller 注释）。
    try {
      await this.ctx.api.unregisterCurrentDevice();
    } catch {
      // best effort
    }
    try {
      await this.ctx.api.logoutCurrent();
    } catch {
      // Best-effort logout
    }

    const wipeLocalData = options?.wipeLocalData === true;
    const snapshot = await this.ctx.services.auth.clearLocalSession({
      wipeLocalData
    });
    if (this.ctx.onUserUnbound) {
      await this.ctx.onUserUnbound({ wipeLocalData });
    }
    return snapshot;
  }
}
