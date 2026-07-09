/*
<<<<<<< HEAD
  Front-end-only auth for the demo. No backend, no users table — just a small
  built-in list of logins checked in the browser, with the session remembered
  in localStorage so a page refresh stays signed in.
*/

const STORAGE_KEY = "ar-manager-auth";

const DEMO_LOGINS = [
=======
  Front-end-only auth for the demo. No backend, no `users` table — just a small
  built-in list of demo logins checked in the browser. Session is remembered in
  localStorage so a refresh stays signed in.
*/

const STORAGE_KEY = "ar_manager_signed_in";

const DEMO_USERS = [
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
  { username: "admin", password: "admin123" },
  { username: "finance", password: "finance123" },
];

<<<<<<< HEAD
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
=======
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
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
}
