// Compiles server/tools/xiaomi/XiaomiPushCli.java against the official Xiaomi
// Java Http2 SDK so the Node provider (server/src/service/push/xiaomi_push_provider.ts)
// can shell out to it via `java -cp`.
//
// Usage:
//   pnpm --filter @mushroom/server tool:xiaomi:build
//
// Prereqs:
//   - A JDK >= 1.8 with `javac` on PATH (override with PUSH_XIAOMI_JAVAC_BIN).
//   - PUSH_XIAOMI_SDK_DIR pointing at the extracted `MiPush_SDK_Server_Http2`
//     directory (read from server/.env or the environment).
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, "..", "..");
const javaSource = join(scriptDir, "XiaomiPushCli.java");
const defaultOutputDir = join(scriptDir, "classes");

// Load server/.env without clobbering any value already exported in the shell.
dotenv.config({ path: join(serverRoot, ".env") });

function fail(message) {
  console.error(`[xiaomi-build] ${message}`);
  process.exit(1);
}

const sdkDirRaw = process.env.PUSH_XIAOMI_SDK_DIR?.trim();
if (!sdkDirRaw) {
  fail(
    "PUSH_XIAOMI_SDK_DIR is not set. Download the official Java Http2 SDK " +
      "(http://admin.xmpush.xiaomi.com/zh_CN/mipush/downpage/java-http2), " +
      "extract it, then set PUSH_XIAOMI_SDK_DIR in server/.env or the environment."
  );
}

const sdkDir = resolve(sdkDirRaw);
let sdkStat;
try {
  sdkStat = statSync(sdkDir);
} catch {
  fail(`PUSH_XIAOMI_SDK_DIR does not exist: ${sdkDir}`);
}
if (!sdkStat.isDirectory()) {
  fail(`PUSH_XIAOMI_SDK_DIR is not a directory: ${sdkDir}`);
}

const jars = readdirSync(sdkDir).filter(name =>
  name.toLowerCase().endsWith(".jar")
);
if (jars.length === 0) {
  fail(`No .jar files found under ${sdkDir}. Extract the SDK zip first.`);
}

// The default helper classpath value (`server/tools/xiaomi/classes`) is
// written relative to the repo root, so resolve relative paths against the
// repo root (not this script's cwd) to keep the two consistent.
const helperClasspathEnv = process.env.PUSH_XIAOMI_HELPER_CLASSPATH?.trim();
const outputDir = helperClasspathEnv
  ? isAbsolute(helperClasspathEnv)
    ? helperClasspathEnv
    : resolve(serverRoot, "..", helperClasspathEnv)
  : defaultOutputDir;
const javacBin = process.env.PUSH_XIAOMI_JAVAC_BIN?.trim() || "javac";
const classpath = `${sdkDir}${process.platform === "win32" ? "\\" : "/"}*`;

mkdirSync(outputDir, { recursive: true });

console.log(`[xiaomi-build] javac:      ${javacBin}`);
console.log(`[xiaomi-build] classpath:  ${classpath}`);
console.log(`[xiaomi-build] source:     ${javaSource}`);
console.log(`[xiaomi-build] output:     ${outputDir}`);

// `--release 17` keeps the bytecode at class-file version 61 so the compiled
// helper runs on the Java 17 JRE shipped in the production container (a newer
// javac would otherwise emit a version the runtime cannot load).
try {
  execFileSync(
    javacBin,
    ["--release", "17", "-cp", classpath, "-d", outputDir, javaSource],
    {
      stdio: "inherit"
    }
  );
} catch {
  fail("javac failed. Make sure the Xiaomi Java Http2 SDK jars are complete.");
}

console.log(`[xiaomi-build] done → ${outputDir}`);
console.log(
  "[xiaomi-build] Make sure PUSH_XIAOMI_HELPER_CLASSPATH points at this directory " +
    "(default `server/tools/xiaomi/classes`)."
);
