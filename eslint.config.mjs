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
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs", "**/generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { money: moneyPlugin },
    rules: {
      "money/no-unsafe-money-arithmetic": "error",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // The money utils themselves are the sanctioned place to do the math.
    files: ["packages/shared/src/money.ts"],
    rules: { "money/no-unsafe-money-arithmetic": "off" },
  },
);
