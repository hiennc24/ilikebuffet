import "@testing-library/jest-dom";

// jsdom does not implement <dialog>.showModal()/close(); polyfill them so the
// @ilikebuffet/ui Dialog can open in component tests.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}
