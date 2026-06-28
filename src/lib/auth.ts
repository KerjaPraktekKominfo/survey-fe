const AUTH_SESSION_KEY = "survey_auth_session";
const LEGACY_AUTH_TOKEN_KEY = "survey_auth_token";
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || "csrf_token";

const storageTargets = [localStorage, sessionStorage] as const;

export const hasAuthSession = () =>
  storageTargets.some((storage) => storage.getItem(AUTH_SESSION_KEY) === "1");

export const persistAuthSession = (rememberMe = false) => {
  clearAuthSession();

  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(AUTH_SESSION_KEY, "1");
};

export const clearAuthSession = () => {
  storageTargets.forEach((storage) => {
    storage.removeItem(AUTH_SESSION_KEY);
    storage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  });
};

const getCookieValue = (name: string) => {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${encodeURIComponent(name)}=`));

  if (!cookie) {
    return "";
  }

  return decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
};

export const authHeaders = (contentType?: string): Record<string, string> => {
  const csrfToken = getCookieValue(CSRF_COOKIE_NAME);

  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  };
};
