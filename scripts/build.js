#!/usr/bin/env node

const { spawn } = require("child_process");
const platforms = process.argv.slice(2);

if (platforms.length === 0) {
  console.log("Please specify platforms to build:");
  console.log("  npm run build web");
  console.log("  npm run build electron");
  console.log("  npm run build mobile");
  console.log("  npm run build server");
  console.log("  npm run build all");
  process.exit(1);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      ...options
    });

    child.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

async function buildSharedPackages() {
  console.log("\n📦 Building shared packages...");
  await runCommand("pnpm", ["--filter", "@mushroom/shared", "build"]);
  await runCommand("pnpm", ["--filter", "@mushroom/app-core", "build"]);
}

async function buildWeb() {
  console.log("\n🌐 Building Web application...");
  await runCommand("pnpm", ["--filter", "@mushroom/web", "build"]);
}

async function buildElectron() {
  console.log("\n🖥️  Building Electron application...");
  await runCommand("pnpm", ["--filter", "@mushroom/electron", "build:all"]);
}

async function buildMobile() {
  console.log("\n📱 Building Mobile application...");
  await runCommand("pnpm", ["--filter", "@mushroom/mobile", "build"]);
}

async function buildServer() {
  console.log("\nBuilding Server application...");
  await runCommand("pnpm", ["--filter", "@mushroom/server", "build"]);
}

async function main() {
  try {
    // Always build shared packages first
    await buildSharedPackages();

    for (const platform of platforms) {
      switch (platform) {
        case "web":
          await buildWeb();
          break;
        case "electron":
          await buildElectron();
          break;
        case "mobile":
          await buildMobile();
          break;
        case "server":
          await buildServer();
          break;
        case "all":
          await buildServer();
          await buildWeb();
          await buildElectron();
          await buildMobile();
          break;
        default:
          console.warn(`⚠️  Unknown platform: ${platform}`);
      }
    }

    console.log("\n✅ Build completed successfully!");
  } catch (error) {
    console.error("\n❌ Build failed:", error.message);
    process.exit(1);
  }
}

main();
