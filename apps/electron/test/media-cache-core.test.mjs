import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

// 注入 electron mock：dist-electron/main/media-cache-core.js 由 vite 打包后
// 通过 require("electron") 调用 app.getPath("userData")。测试环境无 Electron，
// 这里把 require("electron") 重写为一个最小桩实现。
const ELECTRON_USER_DATA = path.join("/", "tmp", "Mushroom");
const electronStub = {
  app: {
    isPackaged: false,
    getPath(name) {
      if (name === "userData") return ELECTRON_USER_DATA;
      return path.join(ELECTRON_USER_DATA, name);
    },
    setPath() {
      // no-op
    }
  }
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, ...rest) {
  if (request === "electron") {
    return "electron";
  }
  return originalResolve.call(this, request, ...rest);
};
// 直接塞进 Module._cache，避免真实 resolve
Module._cache["electron"] = {
  id: "electron",
  filename: "electron",
  loaded: true,
  exports: electronStub
};

const require = createRequire(import.meta.url);
const {
  buildCacheFileName,
  buildDownloadTaskKey,
  buildLocalMediaCacheUrl,
  getCategoryDir,
  getMediaCacheRoot,
  getMonthKey,
  inferExtension,
  isPathInside,
  parseLocalMediaCacheUrl,
  resolveMediaCacheCategory,
  mediaCacheProtocol
} = require("../dist-electron/main/media-cache-core.js");

test("media cache paths follow uid and yyyy_MM directory contract", () => {
  // 新实现：getMediaCacheRoot(uid) → <userData>/users/<uid>/media
  const uid = 42;
  assert.equal(
    getMediaCacheRoot(uid),
    path.join(ELECTRON_USER_DATA, "users", "42", "media")
  );
  assert.equal(getMonthKey(new Date("2026-04-28T12:00:00.000Z")), "2026_04");
  assert.equal(
    getCategoryDir({
      uid,
      monthKey: "2026_04",
      category: "images"
    }),
    path.join(ELECTRON_USER_DATA, "users", "42", "media", "2026_04", "images")
  );
});

test("media cache category inference uses MIME first and extension fallback", () => {
  assert.equal(
    resolveMediaCacheCategory({ mimeType: "image/jpeg", fileName: "x.bin" }),
    "images"
  );
  assert.equal(
    resolveMediaCacheCategory({ mimeType: "audio/m4a", fileName: "x.bin" }),
    "voice"
  );
  assert.equal(
    resolveMediaCacheCategory({ mimeType: "video/mp4", fileName: "x.bin" }),
    "video"
  );
  assert.equal(resolveMediaCacheCategory({ fileName: "report.pdf" }), "files");
  assert.equal(
    resolveMediaCacheCategory({
      mimeType: "image/png",
      fileName: "preview.png",
      explicitCategory: "thumbs"
    }),
    "thumbs"
  );
});

test("media cache file names and download keys are sanitized", () => {
  // sanitizeUsername 已移除：账号现以 uid 物理隔离，不再做用户名清洗。
  assert.equal(
    inferExtension({
      mimeType: "application/pdf",
      fileName: "ignored.bin",
      remoteUrl: "https://example.com/a"
    }),
    "pdf"
  );
  assert.equal(
    buildCacheFileName({
      messageId: "../m:1",
      uploadId: "u/2",
      hash16: "abcdef1234567890",
      extension: "jpg"
    }),
    "_m_1-u_2-abcdef1234567890.jpg"
  );
  assert.equal(
    buildDownloadTaskKey({
      uid: 42,
      category: "files",
      remoteUrl: "https://example.com/a.pdf"
    }),
    "42::files::https://example.com/a.pdf"
  );
});

test("media cache path safety rejects parent traversal", () => {
  const root = path.join(ELECTRON_USER_DATA, "users", "42", "media");
  assert.equal(
    isPathInside(root, path.join(root, "2026_04", "files", "a.pdf")),
    true
  );
  assert.equal(isPathInside(root, path.join(root, "..", "outside.pdf")), false);
});

test("media cache local URLs use the custom Electron protocol", () => {
  const localPath = path.join(
    ELECTRON_USER_DATA,
    "users",
    "42",
    "media",
    "2026_04",
    "images",
    "a b.png"
  );
  const localUrl = buildLocalMediaCacheUrl(localPath);
  assert.equal(localUrl.startsWith(`${mediaCacheProtocol}://local/`), true);
  assert.equal(parseLocalMediaCacheUrl(localUrl), localPath);
});
