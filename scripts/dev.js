#!/usr/bin/env node

const { spawn } = require("child_process");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const platforms = {
  1: {
    name: "Web",
    command: "pnpm",
    args: ["--filter", "@mushroom/web", "dev"]
  },
  2: {
    name: "Electron",
    command: "pnpm",
    args: ["--filter", "@mushroom/electron", "dev"]
  },
  3: {
    name: "Mobile (Android)",
    command: "pnpm",
    args: ["--filter", "@mushroom/mobile", "android"]
  },
  4: {
    name: "Mobile (iOS)",
    command: "pnpm",
    args: ["--filter", "@mushroom/mobile", "ios"]
  },
  5: {
    name: "Server",
    command: "pnpm",
    args: ["--filter", "@mushroom/server", "dev"]
  },
  6: {
    name: "Mobile Metro",
    command: "pnpm",
    args: ["--filter", "@mushroom/mobile", "start"]
  },
  7: {
    name: "Build shared packages",
    command: "pnpm",
    args: ["-r", "--filter", "@mushroom/shared", "build"]
  }
};

function showMenu() {
  console.log("\n🚀 IM App Development Menu");
  console.log("==========================");
  console.log("1. Start Web Development Server");
  console.log("2. Start Electron Development");
  console.log("3. Run Mobile App on Android");
  console.log("4. Run Mobile App on iOS");
  console.log("5. Start Server Development");
  console.log("6. Start Mobile Metro");
  console.log("7. Watch & Build Shared Packages");
  console.log("q. Quit");
  console.log("==========================");
}

function runPlatform(platform) {
  console.log(`\n🚀 Starting ${platform.name}...`);

  const child = spawn(platform.command, platform.args, {
    stdio: "inherit",
    shell: true
  });

  child.on("close", code => {
    console.log(`\n${platform.name} exited with code ${code}`);
    showMenuAndPrompt();
  });

  child.on("error", error => {
    console.error(`\n❌ Error starting ${platform.name}:`, error.message);
    showMenuAndPrompt();
  });

  return child;
}

function showMenuAndPrompt() {
  showMenu();
  rl.question("\nChoose an option: ", answer => {
    if (answer.toLowerCase() === "q") {
      console.log("👋 Goodbye!");
      rl.close();
      process.exit(0);
    }

    const platform = platforms[answer];
    if (platform) {
      runPlatform(platform);
    } else {
      console.log("❌ Invalid option. Please try again.");
      showMenuAndPrompt();
    }
  });
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  const platformKey = args[0];
  const platform = platforms[platformKey];

  if (platform) {
    runPlatform(platform);
  } else {
    console.log(`❌ Invalid platform: ${platformKey}`);
    console.log("Available options: 1-7");
    process.exit(1);
  }
} else {
  // Show interactive menu
  console.log("🎯 Welcome to IM App Development Environment!");
  showMenuAndPrompt();
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Development server stopped. Goodbye!");
  process.exit(0);
});
