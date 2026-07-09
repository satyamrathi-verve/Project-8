"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FormField, inputClass } from "@/components/FormField";
import { login } from "@/lib/auth";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (login(username, password)) {
      setError(null);
      router.push("/");
    } else {
      setError("Wrong username or password. Try again.");
    }
  }

  return (
    <div className="mx-auto max-w-sm p-8">
      <PageHeader title="Sign in" subtitle="Sign in to use the AR Manager." />

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        <FormField label="Username">
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </FormField>

        <FormField label="Password">
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </FormField>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          className="mt-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
        >
          Sign In
        </button>

        <p className="text-center text-xs text-slate-400">
          Demo login: <span className="font-medium text-slate-500">admin</span> /{" "}
          <span className="font-medium text-slate-500">admin123</span>
        </p>
      </form>
    </div>
  );
}
