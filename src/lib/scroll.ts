/**
 * Scrolls to the top. Returns nothing on purpose: browsers differ in what `window.scrollTo`
 * returns (newer ones return a Promise), and a value returned from a React effect is treated
 * as its cleanup function and called later, which crashes the page.
 */
export function scrollToTop(): void {
  window.scrollTo(0, 0);
}
