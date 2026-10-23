/* HtmlService runs inside userCodeAppPanel. Internal navigation must never
 * follow a URL, mutate the frame hash, or depend on access to parent history.
 */
(() => {
  'use strict';
  window.SIA.createRouter = ({ routes, initialRoute, onNavigate, canNavigate, onSameRoute }) => {
    const known = new Set(routes);
    let current = known.has(initialRoute) ? initialRoute : 'dashboard';
    function navigate(route) {
      if (!known.has(route)) return false;
      if (route === current) { onSameRoute?.(); return false; }
      if (canNavigate && !canNavigate(route, current)) return false;
      current = route;
      onNavigate();
      return true;
    }
    function handleClick(event) {
      const control = event.target instanceof Element ? event.target.closest('[data-route]') : null;
      if (!control || !known.has(control.dataset.route)) return;
      event.preventDefault();
      navigate(control.dataset.route);
    }
    document.addEventListener('click', handleClick);
    return { current: () => current, navigate };
  };
})();
