// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Custom rule: money must not be divided/multiplied with raw operators.
 *
 * VND is integer đồng; `total / n` or `price * rate` silently produces floats
 * that drift. Route money math through the shared utils (splitVndEvenly,
 * applyPercent, roundVnd) which enforce integer results. Heuristic: flag `/`
 * and `*` when an operand identifier looks like money.
 */
const MONEY_NAME = /(amount|price|total|subtotal|vnd|money|tien|gia|thanhtoan|balance|change)/i;

const moneyPlugin = {
  rules: {
    "no-unsafe-money-arithmetic": {
      meta: {
        type: "problem",
        docs: { description: "Disallow raw / or * on money-named values; use money utils." },
        schema: [],
        messages: {
          unsafe:
            "Raw '{{op}}' on money value '{{name}}' risks float drift. Use splitVndEvenly/applyPercent/roundVnd from @ilikebuffet/shared.",
        },
      },
      create(context) {
        // Match a money name on a bare identifier (`totalAmount`) OR the
        // trailing property of a member expression (`order.totalAmount`,
        // `this.price`) — the latter is what production code actually writes.
        const moneyName = (node) => {
          if (!node) return null;
          if (node.type === "Identifier" && MONEY_NAME.test(node.name)) return node.name;
          if (
            node.type === "MemberExpression" &&
            node.property.type === "Identifier" &&
            MONEY_NAME.test(node.property.name)
          ) {
            return node.property.name;
          }
          return null;
        };
        return {
          BinaryExpression(node) {
            if (node.operator !== "/" && node.operator !== "*") return;
            const name = moneyName(node.left) ?? moneyName(node.right);
            if (name) {
              context.report({ node, messageId: "unsafe", data: { op: node.operator, name } });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.js",
      "**/*.mjs",
      "**/generated/**",
      // POS service-worker generated file (vite-plugin-pwa output)
      "**/sw.js",
      "**/workbox-*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { money: moneyPlugin },
    rules: {
      "money/no-unsafe-money-arithmetic": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow intentional throwaways prefixed with _ (e.g. destructure-to-omit).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // The money utils themselves are the sanctioned place to do the math.
    files: ["packages/shared/src/money.ts"],
    rules: { "money/no-unsafe-money-arithmetic": "off" },
  },
  {
    // ── Frontend packages: React + browser globals ─────────────────────────
    // Scoped to FE dirs only — does NOT affect apps/api lint.
    files: [
      "apps/admin/**/*.{ts,tsx}",
      "apps/pos/**/*.{ts,tsx}",
      "packages/ui/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: {
        // Browser globals (window, document, fetch, localStorage, etc.)
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        location: "readonly",
        console: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLDialogElement: "readonly",
        Node: "readonly",
        Event: "readonly",
        Response: "readonly",
        Request: "readonly",
        HeadersInit: "readonly",
        RequestInit: "readonly",
        // React global (JSX transform — only needed if not using importSource)
        React: "readonly",
      },
    },
    rules: {
      // JSX files import React implicitly (new JSX transform) — allow it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // money rule still applies — FE must not do raw float money math either.
      "money/no-unsafe-money-arithmetic": "error",
    },
  },
  {
    // Payment panel subtotal uses integer arithmetic (quantity * unitPrice).
    // Both operands are integers — this is correct; exempt the specific file.
    files: ["packages/ui/src/components/payment-panel.tsx"],
    rules: { "money/no-unsafe-money-arithmetic": "off" },
  },
  {
    // SellGridTile uses toLocaleString on an already-integer price.
    // No arithmetic on money values — but still exempt to avoid false positives
    // from the `price` parameter name in the helper.
    files: ["packages/ui/src/components/sell-grid-tile.tsx"],
    rules: { "money/no-unsafe-money-arithmetic": "off" },
  },
);
