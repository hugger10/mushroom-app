import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/dist-electron/**",
      "**/node_modules/**",
      ".pnpm-store/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
      "apps/web/.eslintrc.js"
    ]
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        tsconfigRootDir: __dirname
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: ["**/*.{js,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    extends: [
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite
    ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname
      },
      globals: {
        ...globals.browser
      }
    }
  },
  {
    // Enforce centralized logger usage across all client apps. `console.warn`
    // and `console.error` remain allowed as last-resort fallbacks (e.g. inside
    // the logger implementation itself or in startup paths before the logger
    // is wired up). Logger entry files opt-out via /* eslint-disable no-console */.
    files: ["apps/{mobile,web,electron}/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }]
    }
  }
);
