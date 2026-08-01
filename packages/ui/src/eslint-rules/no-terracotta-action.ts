/**
 * ESLint rule: no-terracotta-action (token-conformance lint)
 *
 * Enforces DECISION #1: the brand terracotta colour (#C96442, #AC4E31,
 * etc.) must NOT appear on variant="action" buttons.
 *
 * Also enforces touch-target minimum: any element with data-touch="true"
 * or touch={true} must not have an explicit height/minHeight/width/minWidth
 * below 48px in JSX style literals.
 *
 * Replaces brittle colour snapshot tests (rationale: snapshots test
 * structure not behaviour; they break on any cosmetic rename and give false
 * confidence when the token changes upstream).
 *
 * Registered in root eslint.config.mjs under `ui` plugin, scoped to
 * apps/pos, apps/admin, packages/ui.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Rule } from "eslint";

/** Known terracotta hex values — explicitly excluded from action buttons per DECISION #1. */
const TERRACOTTA_PATTERN =
  /#(?:C96442|AC4E31|c96442|ac4e31|D4754F|d4754F|B85B38|b85b38)/i;

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "DECISION #1: terracotta colour must not be used on action-variant Button; " +
        "use --action-bg (lam teal) instead.",
    },
    schema: [],
    messages: {
      terracottaOnAction:
        'Terracotta ({{color}}) must not appear on variant="action" (DECISION #1). ' +
        "Use var(--action-bg) instead.",
      touchSizeTooSmall:
        "touch={true} element has explicit {{prop}}={{value}}px which is below the " +
        "48px minimum (DECISION #8). Remove the explicit override or increase it.",
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node: any) {
        const attrs: any[] = (node.attributes ?? []).filter(
          (a: any) => a.type === "JSXAttribute",
        );

        const getAttrValue = (name: string): string | null => {
          const attr = attrs.find(
            (a: any) => a.type === "JSXAttribute" && a.name?.name === name,
          );
          if (!attr) return null;
          const val = attr.value;
          if (!val) return null;
          if (val.type === "Literal") return String(val.value);
          if (
            val.type === "JSXExpressionContainer" &&
            val.expression?.type === "Literal"
          )
            return String(val.expression.value);
          return null;
        };

        const componentName =
          node.name?.type === "JSXIdentifier" ? node.name.name : null;

        // ── Check 1: terracotta on action variant ──────────────────────────
        const variant = getAttrValue("variant");
        if (componentName === "Button" && variant === "action") {
          const styleAttr = attrs.find(
            (a: any) => a.type === "JSXAttribute" && a.name?.name === "style",
          );
          if (styleAttr?.value) {
            const raw = context.getSourceCode().getText(styleAttr.value as Rule.Node);
            const match = TERRACOTTA_PATTERN.exec(raw);
            if (match) {
              context.report({
                node: styleAttr as Rule.Node,
                messageId: "terracottaOnAction",
                data: { color: match[0] },
              });
            }
          }
        }

        // ── Check 2: touch-size minimum ────────────────────────────────────
        const touchVal = getAttrValue("touch") ?? getAttrValue("data-touch");
        const hasTouch = touchVal === "true" || touchVal === "";
        if (hasTouch) {
          const SIZE_PROPS = ["height", "minHeight", "width", "minWidth"] as const;
          const styleAttr = attrs.find(
            (a: any) => a.type === "JSXAttribute" && a.name?.name === "style",
          );
          if (styleAttr?.value) {
            const raw = context.getSourceCode().getText(styleAttr.value as Rule.Node);
            for (const prop of SIZE_PROPS) {
              const pxMatch = new RegExp(`${prop}\\s*:\\s*["']?(\\d+)px["']?`).exec(raw);
              if (pxMatch) {
                const px = parseInt(pxMatch[1], 10);
                if (px < 48) {
                  context.report({
                    node: styleAttr as Rule.Node,
                    messageId: "touchSizeTooSmall",
                    data: { prop, value: String(px) },
                  });
                }
              }
            }
          }
        }
      },
    };
  },
};

export default rule;
