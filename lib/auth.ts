/*
  Front-end-only auth for the demo. No backend, no users table — just a small
  built-in list of logins checked in the browser, with the session remembered
  in localStorage so a page refresh stays signed in.
*/

const STORAGE_KEY = "ar-manager-auth";

const DEMO_LOGINS = [
  { username: "admin", password: "admin123" },
  { username: "finance", password: "finance123" },
];

export function login(username: string, password: string): boolean {
  const match = DEMO_LOGINS.some(
    (u) => u.username === username.trim() && u.password === password
  );
  if (match) {
    localStorage.setItem(STORAGE_KEY, username.trim());
  }
  return match;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getCurrentUser(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}
