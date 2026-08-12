import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const visibilityModule = require("../dist/server/src/service/presence_visibility.js");
const privacyRepoModule = require("../dist/server/src/repository/privacy_repository.js");
const contactRepoModule = require("../dist/server/src/repository/contact_repository.js");

const { loadPresenceVisibilityContext, evaluatePresenceVisibility } =
  visibilityModule;
const PrivacyRepository = privacyRepoModule.default;
const ContactRepository = contactRepoModule.default;

/**
 * P3.2 visibility 过滤 + P3.3 last_active_at 模糊化 单元测试。
 * 通过覆盖 PrivacyRepository / UserRepository 上的方法注入受控数据。
 *
 * 单向联系人语义：contacts_only 仅要求 viewer→target 单向，
 * 与 Telegram / WhatsApp 单向通讯录对齐。
 */

function withStubs({ privacyRows, viewerSaved }, fn) {
  const originals = {
    findManyByUserIds: PrivacyRepository.findManyByUserIds,
    listSavedContactIds: ContactRepository.listSavedContactIds
  };
  PrivacyRepository.findManyByUserIds = async () => privacyRows;
  ContactRepository.listSavedContactIds = async () => viewerSaved;
  return fn().finally(() => {
    PrivacyRepository.findManyByUserIds = originals.findManyByUserIds;
    ContactRepository.listSavedContactIds = originals.listSavedContactIds;
  });
}

// 固定一个 last_active_at 用于桶化校验：12:07 应桶化到 12:05
const RAW_LAST_ACTIVE = "2026-05-11T12:07:34.000Z";
const BUCKETED_LAST_ACTIVE = "2026-05-11T12:05:00.000Z";

test("visibility=2 (nobody) hides presence entirely", async () => {
  await withStubs(
    {
      privacyRows: [{ user_id: 200, presence_visibility: 2 }],
      viewerSaved: [200]
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [200]);
      const result = ctx.evaluate(200, {
        is_online: true,
        active_device_count: 3,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.is_online, false);
      assert.equal(result.active_device_count, 0);
      assert.equal(result.last_active_at, undefined);
    }
  );
});

test("visibility=0 (anyone) returns data with bucketized last_active_at", async () => {
  await withStubs(
    {
      privacyRows: [{ user_id: 200, presence_visibility: 0 }],
      viewerSaved: []
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [200]);
      const result = ctx.evaluate(200, {
        is_online: true,
        active_device_count: 2,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.is_online, true);
      assert.equal(result.active_device_count, 2);
      assert.equal(result.last_active_at, BUCKETED_LAST_ACTIVE);
    }
  );
});

test("visibility=1 (contacts_only) requires viewer to have saved target (one-way)", async () => {
  // viewer 未保存 target → 隐藏
  await withStubs(
    {
      privacyRows: [{ user_id: 200, presence_visibility: 1 }],
      viewerSaved: []
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [200]);
      const result = ctx.evaluate(200, {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.is_online, false);
      assert.equal(result.active_device_count, 0);
      assert.equal(result.last_active_at, undefined);
    }
  );

  // viewer 已保存 target → 可见 + 桶化（无须 target 反向加 viewer）
  await withStubs(
    {
      privacyRows: [{ user_id: 200, presence_visibility: 1 }],
      viewerSaved: [200]
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [200]);
      const result = ctx.evaluate(200, {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.is_online, true);
      assert.equal(result.last_active_at, BUCKETED_LAST_ACTIVE);
    }
  );
});

test("viewer === target bypasses filter and bucketize", async () => {
  await withStubs(
    {
      privacyRows: [],
      viewerSaved: []
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [100]);
      const result = ctx.evaluate(100, {
        is_online: true,
        active_device_count: 2,
        last_active_at: RAW_LAST_ACTIVE
      });
      // 自查不做模糊化
      assert.equal(result.last_active_at, RAW_LAST_ACTIVE);
      assert.equal(result.is_online, true);
    }
  );
});

test("missing privacy row defaults to contacts_only", async () => {
  // 没有 privacy 行 + viewer 未保存 → 默认 1 + 单向不满足 → 隐藏
  await withStubs(
    {
      privacyRows: [],
      viewerSaved: []
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [200]);
      const result = ctx.evaluate(200, {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.is_online, false);
    }
  );

  // 没有 privacy 行 + viewer 已保存 target → 默认 1 + 单向满足 → 可见
  await withStubs(
    {
      privacyRows: [],
      viewerSaved: [200]
    },
    async () => {
      const ctx = await loadPresenceVisibilityContext(100, [200]);
      const result = ctx.evaluate(200, {
        is_online: true,
        active_device_count: 1,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.is_online, true);
      assert.equal(result.last_active_at, BUCKETED_LAST_ACTIVE);
    }
  );
});

test("evaluatePresenceVisibility single-target convenience", async () => {
  await withStubs(
    {
      privacyRows: [{ user_id: 200, presence_visibility: 0 }],
      viewerSaved: []
    },
    async () => {
      const result = await evaluatePresenceVisibility(100, 200, {
        is_online: false,
        active_device_count: 0,
        last_active_at: RAW_LAST_ACTIVE
      });
      assert.equal(result.last_active_at, BUCKETED_LAST_ACTIVE);
    }
  );
});
