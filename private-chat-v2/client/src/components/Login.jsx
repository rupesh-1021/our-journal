import React, { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "../services/api";
export default function Login({ onLogin }) {
  const [u, setU] = useState(""),
    [p, setP] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: u, password: p }),
      });
      localStorage.setItem("token", d.token);
      onLogin(d.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-full grid place-items-center bg-zinc-950 p-5 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-7 shadow-2xl"
      >
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/15 text-rose-400">
          <LockKeyhole />
        </div>
        <h1 className="text-3xl font-bold">Between Us</h1>
        <p className="mt-2 mb-6 text-sm text-zinc-400">
          Private two-person messenger
        </p>
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <input
          autoComplete="username"
          required
          value={u}
          onChange={(e) => setU(e.target.value)}
          placeholder="Username"
          className="mb-3 w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none ring-rose-500 focus:ring-2"
        />
        <input
          autoComplete="current-password"
          required
          type="password"
          value={p}
          onChange={(e) => setP(e.target.value)}
          placeholder="Password"
          className="mb-5 w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none ring-rose-500 focus:ring-2"
        />
        <button
          disabled={busy}
          className="w-full rounded-xl bg-rose-500 py-3 font-semibold hover:bg-rose-400 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
