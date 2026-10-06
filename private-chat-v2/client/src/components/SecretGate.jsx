import React, { useState } from "react";
import { KeyRound } from "lucide-react";
export default function SecretGate({ onUnlock }) {
  const [s, setS] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/95 p-5 text-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (s.length < 8) return;
          sessionStorage.setItem("chatSecret", s);
          onUnlock(s);
        }}
        className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-7"
      >
        <KeyRound className="mb-4 text-amber-400" />
        <h2 className="text-2xl font-bold">Unlock this chat</h2>
        <p className="mt-2 mb-5 text-sm text-zinc-400">
          Enter the same private passphrase on both devices. It is kept in this
          browser session and is never sent to the server.
        </p>
        <input
          type="password"
          minLength={8}
          required
          value={s}
          onChange={(e) => setS(e.target.value)}
          className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none"
          placeholder="Shared encryption passphrase"
        />
        <button className="mt-4 w-full rounded-xl bg-amber-500 py-3 font-semibold text-black">
          Unlock
        </button>
      </form>
    </div>
  );
}
