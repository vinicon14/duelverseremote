/** Opens a URL in a new tab bypassing the app's ad pop-up blockers. Use only for user-initiated, trusted links. */
export const openTrusted = (url: string) => {
  const w = window as any;
  const native: typeof window.open =
    w._originalWindowOpen || w._originalOpen || Window.prototype.open || window.open;
  const win = native.call(window, url, '_blank');
  if (win) { try { win.opener = null; } catch {} }
  if (!win) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer sponsored';
    document.body.appendChild(a); a.click(); a.remove();
  }
};
