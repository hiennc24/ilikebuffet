/**
 * Token-conformance ESLint rules for ilikebuffet UI.
 *
 * Registered in root eslint.config.mjs as plugin `ui`, scoped to
 * apps/* and packages/ui — does not affect apps/api lint.
 */

import noTerracottaAction from "./no-terracotta-action";

export const rules = {
  "no-terracotta-action": noTerracottaAction,
};

/** Drop-in ESLint plugin object. */
export const uiPlugin = {
  rules,
};
