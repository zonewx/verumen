export const flash = (msg, ms = 3000) => {
  window.dispatchEvent(new CustomEvent('app:flash', { detail: { msg, ms } }));
};
