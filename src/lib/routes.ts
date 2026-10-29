// Pages that require a signed-in, verified user. Each page/action also checks
// authorization on the server; the middleware is only the first gate.
export const PROTECTED_PREFIXES = [
  "/reports", "/my-reports", "/matches", "/requests", "/messages", "/notifications",
  "/map", "/profile", "/settings", "/admin", "/users",
];
export const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

export const isProtectedPath = (path: string) => PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
