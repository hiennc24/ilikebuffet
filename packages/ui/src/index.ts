/**
 * @ilikebuffet/ui — public API
 *
 * Exports only the POS-first primitives needed here.
 * DataTable (allowWrap, shared total-row) is DEFERRED to reporting wave.
 */

export { Button } from "./components/button";
export type { ButtonProps, ButtonVariant } from "./components/button";

export { FormField } from "./components/form-field";
export type { FormFieldProps } from "./components/form-field";

export { Dialog } from "./components/dialog";
export type { DialogProps } from "./components/dialog";

export { SellGridTile } from "./components/sell-grid-tile";
export type { SellGridTileProps } from "./components/sell-grid-tile";

export { PaymentPanel } from "./components/payment-panel";
export type { PaymentPanelProps, OrderItem } from "./components/payment-panel";

export { uiPlugin, rules as uiRules } from "./eslint-rules/index";
