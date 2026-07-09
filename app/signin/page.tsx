"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField, inputClass } from "@/components/FormField";
import { checkCredentials, signIn } from "@/lib/auth";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (checkCredentials(username, password)) {
      signIn();
      router.push("/");
    } else {
      setError("Wrong username or password. Try admin / admin123.");
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">Verve</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">AR Manager</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <FormField label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Password">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Sign In
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400">
          Demo login: <span className="font-medium text-slate-600">admin</span> /{" "}
          <span className="font-medium text-slate-600">admin123</span>
        </p>
      </div>
    </div>
  );
}
