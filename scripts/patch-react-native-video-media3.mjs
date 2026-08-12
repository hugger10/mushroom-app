/**
 * Temporary patch for react-native-video 6.19.2 Android media3 1.9.0
 * incompatibility.
 *
 * Why: react-native-video 6.19.2 is compiled against androidx.media3 1.8.0,
 * but react-native-vision-camera v5's camera-video 1.7.0-alpha02 pulls media3
 * up to 1.9.0, which removed the DefaultLoadControl constructor signature and
 * the no-arg getAllocator() that RNVLoadControl relies on. This caused
 * `NoSuchMethodError` crashes when rendering <Video /> on Android.
 *
 * Upstream tracking: TheWidlarzGroup/react-native-video issue #4900
 * ("Android : Not compatible with react-native-vission-camera v5") and
 * open PR #5016 ("fix(android): support Media3 1.9 LoadControl API").
 *
 * 待官方发布修复版本后，删除本补丁并升级 react-native-video。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const targetFile = path.join(
  rootDir,
  "node_modules",
  "react-native-video",
  "android",
  "src",
  "main",
  "java",
  "com",
  "brentvatne",
  "exoplayer",
  "ReactExoplayerView.java"
);

const constructorStart =
  "        public RNVLoadControl(DefaultAllocator allocator, BufferConfig config) {\n" +
  "            super(allocator,";
const constructorEnd =
  "DefaultLoadControl.DEFAULT_RETAIN_BACK_BUFFER_FROM_KEYFRAME);";

const constructorPatched =
  "        public RNVLoadControl(DefaultAllocator allocator, BufferConfig config) {\n" +
  "            int minBufferMs =";

const constructorBlock = `        public RNVLoadControl(DefaultAllocator allocator, BufferConfig config) {
            super(allocator,
                    config.getMinBufferMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getMinBufferMs()
                            : DefaultLoadControl.DEFAULT_MIN_BUFFER_MS,
                    config.getMinBufferMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getMinBufferMs()
                            : DefaultLoadControl.DEFAULT_MIN_BUFFER_MS,
                    config.getMaxBufferMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getMaxBufferMs()
                            : DefaultLoadControl.DEFAULT_MAX_BUFFER_MS,
                    config.getMaxBufferMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getMaxBufferMs()
                            : DefaultLoadControl.DEFAULT_MAX_BUFFER_MS,
                    config.getBufferForPlaybackMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getBufferForPlaybackMs()
                            : DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
                    config.getBufferForPlaybackMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getBufferForPlaybackMs()
                            : DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
                    config.getBufferForPlaybackAfterRebufferMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getBufferForPlaybackAfterRebufferMs()
                            : DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
                    config.getBufferForPlaybackAfterRebufferMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getBufferForPlaybackAfterRebufferMs()
                            : DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
                    -1,
                    true,
                    true,
                    config.getBackBufferDurationMs() != BufferConfig.Companion.getBufferConfigPropUnsetInt()
                            ? config.getBackBufferDurationMs()
                            : DefaultLoadControl.DEFAULT_BACK_BUFFER_DURATION_MS,
                    DefaultLoadControl.DEFAULT_RETAIN_BACK_BUFFER_FROM_KEYFRAME,
                    java.util.Collections.<String, Integer>emptyMap());
            this.allocator = allocator;`;

const allocatorFieldOriginal =
  "    private class RNVLoadControl extends DefaultLoadControl {\n" +
  "        private final int availableHeapInBytes;";
const allocatorFieldPatched =
  "    private class RNVLoadControl extends DefaultLoadControl {\n" +
  "        private final DefaultAllocator allocator;\n" +
  "        private final int availableHeapInBytes;";

const getAllocatorOriginal = "getAllocator().getTotalBytesAllocated();";
const getAllocatorPatched = "allocator.getTotalBytesAllocated();";

async function applyReplace(source, marker, original, replacement, label) {
  if (source.includes(marker)) {
    console.info(`[rnvideo-media3-patch] ${label} already applied.`);
    return source;
  }
  if (!source.includes(original)) {
    console.warn(
      `[rnvideo-media3-patch] Expected source for ${label} was not found; skipping.`
    );
    return source;
  }
  const next = source.replace(original, replacement);
  console.info(`[rnvideo-media3-patch] Applied ${label}.`);
  return next;
}

async function main() {
  let source;
  try {
    source = await fs.readFile(targetFile, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.info(
        "[rnvideo-media3-patch] react-native-video is not installed; skipping patch."
      );
      return;
    }
    throw error;
  }

  if (
    source.includes(constructorPatched) &&
    source.includes(allocatorFieldPatched) &&
    source.includes(getAllocatorPatched)
  ) {
    console.info(
      "[rnvideo-media3-patch] react-native-video already patched for media3 1.9.0."
    );
    return;
  }

  // 1. Replace the 1.8.0 DefaultLoadControl constructor call with the 1.9.0
  //    signature (camera-video 1.7.0-alpha02 pulls media3 to 1.9.0).
  const startIdx = source.indexOf(constructorStart);
  if (startIdx !== -1 && !source.includes(constructorPatched)) {
    const endIdx = source.indexOf(
      constructorEnd,
      startIdx + constructorStart.length
    );
    if (endIdx === -1) {
      console.warn(
        "[rnvideo-media3-patch] Expected RNVLoadControl constructor tail was not found; skipping constructor patch."
      );
    } else {
      const blockEnd = endIdx + constructorEnd.length;
      source =
        source.slice(0, startIdx) + constructorBlock + source.slice(blockEnd);
      console.info(
        "[rnvideo-media3-patch] Applied media3 1.9.0 DefaultLoadControl constructor."
      );
    }
  }

  // 2. Keep a reference to the DefaultAllocator passed into the constructor;
  //    media3 1.9.0 removed the no-arg getAllocator() override point.
  source = await applyReplace(
    source,
    allocatorFieldPatched,
    allocatorFieldOriginal,
    allocatorFieldPatched,
    "DefaultAllocator field"
  );

  // 3. Use the stored allocator instead of the removed no-arg getAllocator().
  source = await applyReplace(
    source,
    getAllocatorPatched,
    getAllocatorOriginal,
    getAllocatorPatched,
    "getAllocator() replacement"
  );

  await fs.writeFile(targetFile, source, "utf8");
  console.info(
    "[rnvideo-media3-patch] Patched react-native-video RNVLoadControl for media3 1.9.0."
  );
}

main().catch(error => {
  console.error("[rnvideo-media3-patch] Failed to patch react-native-video.");
  console.error(error);
  process.exitCode = 1;
});
