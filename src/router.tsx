import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Params = Record<string, string | undefined>;

type RouterState = {
  pathname: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  params: Params;
  setParams: (p: Params) => void;
};

const RouterContext = createContext<RouterState | null>(null);

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname || '/');
  const [params, setParams] = useState<Params>({});

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setPathname(window.location.pathname || '/');
  }, []);

  const value = useMemo(() => ({ pathname, navigate, params, setParams }), [pathname, params]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useNavigate() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useNavigate must be used within a BrowserRouter');
  return ctx.navigate;
}

export function useParams<T extends Params = Params>(): T {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useParams must be used within a BrowserRouter');
  return ctx.params as T;
}

export function Routes({ children }: { children: React.ReactNode }) {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('Routes must be used within a BrowserRouter');

  const routeElements = React.Children.toArray(children).filter(Boolean) as React.ReactElement[];
  let matchedElement: React.ReactNode = null;
  let matchedParams: Params = {};

  for (const el of routeElements) {
    if (el.type === React.Fragment) continue;
    if (el.type !== Route) continue;
    const { path, element } = el.props as { path: string; element: React.ReactNode };
    const match = matchPath(path, ctx.pathname);
    if (match.matched) {
      matchedElement = element;
      matchedParams = match.params;
      break;
    }
  }

  useEffect(() => {
    if (!shallowEqualParams(ctx.params, matchedParams)) {
      ctx.setParams(matchedParams);
    }
  }, [ctx, matchedParams]);

  return matchedElement ? <>{matchedElement}</> : null;
}

export function Route(_props: { path: string; element: React.ReactNode }) {
  return null;
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

function matchPath(pattern: string, pathname: string): { matched: boolean; params: Params } {
  if (pattern === '*') return { matched: true, params: {} };
  const pat = trimSlashes(pattern).split('/').filter(Boolean);
  const path = trimSlashes(pathname).split('/').filter(Boolean);

  if (pat.length !== path.length) return { matched: false, params: {} };

  const params: Params = {};
  for (let i = 0; i < pat.length; i++) {
    const p = pat[i];
    const s = path[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(s);
      continue;
    }
    if (p !== s) return { matched: false, params: {} };
  }
  return { matched: true, params };
}

function trimSlashes(s: string) {
  if (s === '/') return '';
  return s.replace(/^\/+|\/+$/g, '');
}

function shallowEqualParams(a: Params, b: Params) {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
