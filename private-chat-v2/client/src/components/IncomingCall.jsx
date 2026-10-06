import React from "react";
import { Phone, PhoneOff, Video } from "lucide-react";

export default function IncomingCall({
  video,
  onAccept,
  onReject,
  accepting = false,
  profileUrl = null,
  partnerName = "Your partner",
}) {
  const initials = String(partnerName || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center text-white shadow-2xl">
        {/* PROFILE */}

        <div className="mx-auto mb-5 h-28 w-28 overflow-hidden rounded-full shadow-xl ring-4 ring-rose-500/20">
          {profileUrl ? (
            <img
              src={profileUrl}
              alt={partnerName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 text-3xl font-bold">
              {initials || "?"}
            </div>
          )}
        </div>

        <div className="mb-3 flex items-center justify-center gap-2 text-rose-400">
          {video ? <Video size={20} /> : <Phone size={20} />}

          <span className="text-sm">
            Incoming {video ? "video" : "voice"} call
          </span>
        </div>

        <h2 className="text-2xl font-semibold">{partnerName}</h2>

        <p className="mt-2 text-sm text-zinc-400">is calling…</p>

        {accepting && <p className="mt-4 text-sm text-zinc-300">Connecting…</p>}

        <div className="mt-8 flex items-center justify-center gap-10">
          <div className="text-center">
            <button
              type="button"
              disabled={accepting}
              onClick={onReject}
              className="grid h-16 w-16 place-items-center rounded-full bg-red-600 transition hover:bg-red-500 disabled:opacity-40"
              title="Decline"
            >
              <PhoneOff size={26} />
            </button>

            <div className="mt-2 text-xs text-zinc-400">Decline</div>
          </div>

          <div className="text-center">
            <button
              type="button"
              disabled={accepting}
              onClick={onAccept}
              className="grid h-16 w-16 place-items-center rounded-full bg-emerald-600 transition hover:bg-emerald-500 disabled:opacity-40"
              title="Accept"
            >
              <Phone size={26} />
            </button>

            <div className="mt-2 text-xs text-zinc-400">Accept</div>
          </div>
        </div>
      </div>
    </div>
  );
}
