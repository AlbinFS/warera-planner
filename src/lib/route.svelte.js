/** The current page, from the URL path; links switch pages without reloading. */
export const route = $state({ path: location.pathname });

export function navigate(path) {
  if (path === route.path) return;
  history.pushState(null, '', path);
  route.path = path;
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => { route.path = location.pathname; });
