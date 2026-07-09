/*
  Front-end-only auth for the demo. No backend, no `users` table — just a small
  built-in list of demo logins checked in the browser. Session is remembered in
  localStorage so a refresh stays signed in.
*/

const STORAGE_KEY = "ar_manager_signed_in";

const DEMO_USERS = [
  { username: "admin", password: "admin123" },
  { username: "finance", password: "finance123" },
];

export function checkCredentials(username: string, password: string): boolean {
  return DEMO_USERS.some((u) => u.username === username && u.password === password);
}

export function isSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function signIn(): void {
  window.localStorage.setItem(STORAGE_KEY, "true");
}

export function signOut(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
