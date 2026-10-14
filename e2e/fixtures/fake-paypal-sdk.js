// TEST-ONLY stand-in for https://www.sandbox.paypal.com/web-sdk/v6/core, served by Playwright
// route interception. It mimics the documented v6 surface WorldLens uses:
// createInstance → findEligibleMethods → createPayPalOneTimePaymentSession → start(mode, orderPromise).
(function () {
  class FakePayPalButton extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<button part="button" style="width:100%;padding:10px;border-radius:6px;background:#ffc439;border:0;font-weight:700">PayPal (test double)</button>';
    }
  }
  if (!customElements.get('paypal-button'))
    customElements.define('paypal-button', FakePayPalButton);
  window.paypal = {
    version: '6.0.0-test-double',
    createInstance: async function (opts) {
      window.__fakePayPalInit = opts;
      return {
        findEligibleMethods: async () => ({
          isEligible: (m) => m === 'paypal',
          getDetails: () => ({}),
        }),
        updateLocale: () => {},
        createPayPalOneTimePaymentSession: (handlers) => ({
          start: async (_mode, orderPromise) => {
            const { orderId } = await orderPromise;
            await new Promise((r) => setTimeout(r, 250));
            if (window.__FAKE_PAYPAL_OUTCOME === 'cancel') handlers.onCancel({ orderId });
            else if (window.__FAKE_PAYPAL_OUTCOME === 'error')
              handlers.onError({
                name: 'Error',
                code: 'TEST',
                message: 'test error',
                isRecoverable: false,
              });
            else
              await handlers.onApprove({ orderId, payerId: 'TESTPAYER', fundingSource: 'paypal' });
          },
        }),
      };
    },
  };
})();
