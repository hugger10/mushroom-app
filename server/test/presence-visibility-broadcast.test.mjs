import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const visibilityModule = require("../dist/server/src/service/presence_visibility.js");
const privacyRepoModule = require("../dist/server/src/repository/privacy_repository.js");
const contactRepoModule = require("../dist/server/src/repository/contact_repository.js");

const { loadPresenceVisibilityForBroadcast } = visibilityModule;
const PrivacyRepository = privacyRepoModule.default;
const ContactRepository = contactRepoModule.default;

/**
 * P3 broadcast 专用批量 context 单测。
 * 目标：一次 flush 内对 N 个 viewer 仅触发常数次 SQL（避免 N+1）。
 *
 * 单向联系人语义：contacts_only 仅要求 viewer→target（viewer 加了 target）。
 * 实现上 broadcast 路径用 listReverseContactOwners(target) 一次拿到
 * "把 target 加为联系人"的所有 owner，再与 viewers 求交。
 */

function withStubs({ privacyRow, ownersOfTarget }, fn) {
  const originals = {
    findByUserId: PrivacyRepository.findByUserId,
    listReverseContactOwners: ContactRepository.listReverseContactOwners
  };
  const callCount = {
    findByUserId: 0,
    listReverseContactOwners: 0
  };
  PrivacyRepository.findByUserId = async () => {
    callCount.findByUserId += 1;
    return privacyRow;
  };
  ContactRepository.listReverseContactOwners = async () => {
    callCount.listReverseContactOwners += 1;
    return ownersOfTarget;
  };
  return fn(callCount).finally(() => {
    PrivacyRepository.findByUserId = originals.findByUserId;
    ContactRepository.listReverseContactOwners =
      originals.listReverseContactOwners;
  });
}

const RAW = "2026-05-11T12:07:34.000Z";
const BUCKETED = "2026-05-11T12:05:00.000Z";

test("broadcast ctx runs only 2 SQL calls regardless of viewer count", async () => {
  await withStubs(
    {
      privacyRow: { user_id: 200, presence_visibility: 0 },
      ownersOfTarget: []
    },
    async callCount => {
      const ctx = await loadPresenceVisibilityForBroadcast(
        200,
        [101, 102, 103, 104, 105]
      );
      for (const v of [101, 102, 103, 104, 105]) {
        ctx.evaluate(v, {
          is_online: true,
          active_device_count: 1,
          last_active_at: RAW
        });
      }
      assert.equal(callCount.findByUserId, 1);
      assert.equal(callCount.listReverseContactOwners, 1);
    }
  );
});

test("broadcast visibility=2 hides for every viewer", async () => {
  await withStubs(
    {
      privacyRow: { user_id: 200, presence_visibility: 2 },
      ownersOfTarget: [101, 102]
    },
    async () => {
      const ctx = await loadPresenceVisibilityForBroadcast(200, [101, 102]);
      for (const v of [101, 102]) {
        const r = ctx.evaluate(v, {
          is_online: true,
          active_device_count: 1,
          last_active_at: RAW
        });
        assert.equal(r.is_online, false);
        assert.equal(r.active_device_count, 0);
        assert.equal(r.last_active_at, undefined);
      }
    }
  );
});

test("broadcast visibility=0 returns bucketized data for all viewers", async () => {
  await withStubs(
    {
      privacyRow: { user_id: 200, presence_visibility: 0 },
      ownersOfTarget: []
    },
    async () => {
      const ctx = await loadPresenceVisibilityForBroadcast(200, [101, 102]);
      const r = ctx.evaluate(101, {
        is_online: true,
        active_device_count: 2,
        last_active_at: RAW
      });
      assert.equal(r.is_online, true);
      assert.equal(r.active_device_count, 2);
      assert.equal(r.last_active_at, BUCKETED);
    }
  );
});

test("broadcast visibility=1 contacts_only filters per viewer (one-way)", async () => {
  // target=200; viewers=[101 加了 target, 102 没加, 103 加了 target, 104 没加]
  await withStubs(
    {
      privacyRow: { user_id: 200, presence_visibility: 1 },
      ownersOfTarget: [101, 103, 999] // 101/103/999 把 target 加为联系人
    },
    async () => {
      const ctx = await loadPresenceVisibilityForBroadcast(
        200,
        [101, 102, 103, 104]
      );
      const summary = {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW
      };
      const r1 = ctx.evaluate(101, summary);
      const r2 = ctx.evaluate(102, summary);
      const r3 = ctx.evaluate(103, summary);
      const r4 = ctx.evaluate(104, summary);
      // 101 加了 target → 可见
      assert.equal(r1.is_online, true);
      assert.equal(r1.last_active_at, BUCKETED);
      // 102 没加 → 隐藏
      assert.equal(r2.is_online, false);
      // 103 加了 target → 可见
      assert.equal(r3.is_online, true);
      assert.equal(r3.last_active_at, BUCKETED);
      // 104 陌生 → 隐藏
      assert.equal(r4.is_online, false);
    }
  );
});

test("broadcast missing privacy row defaults to contacts_only", async () => {
  await withStubs(
    {
      privacyRow: null,
      ownersOfTarget: [101]
    },
    async () => {
      const ctx = await loadPresenceVisibilityForBroadcast(200, [101, 102]);
      const summary = {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW
      };
      const r1 = ctx.evaluate(101, summary);
      const r2 = ctx.evaluate(102, summary);
      // 101 加了 target → 可见
      assert.equal(r1.is_online, true);
      // 102 没加 → 隐藏
      assert.equal(r2.is_online, false);
    }
  );
});

test("broadcast empty viewers short-circuits without SQL", async () => {
  await withStubs(
    {
      privacyRow: { user_id: 200, presence_visibility: 0 },
      ownersOfTarget: []
    },
    async callCount => {
      const ctx = await loadPresenceVisibilityForBroadcast(200, []);
      // 应短路：不触发任何 repository 调用
      assert.equal(callCount.findByUserId, 0);
      assert.equal(callCount.listReverseContactOwners, 0);
      // 非 self viewer 直接 HIDDEN
      const r = ctx.evaluate(999, {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW
      });
      assert.equal(r.is_online, false);
    }
  );
});

test("broadcast skipBucketize option keeps raw last_active_at (offline transition)", async () => {
  // 用于 presence transition 广播：下线瞬间 last_active_at 不应再桶化
  await withStubs(
    {
      privacyRow: { user_id: 200, presence_visibility: 0 },
      ownersOfTarget: []
    },
    async () => {
      const ctx = await loadPresenceVisibilityForBroadcast(200, [101]);
      const r = ctx.evaluate(
        101,
        {
          is_online: false,
          active_device_count: 0,
          last_active_at: RAW
        },
        { skipBucketize: true }
      );
      assert.equal(r.is_online, false);
      assert.equal(r.last_active_at, RAW, "不应被桶化");
    }
  );
});
