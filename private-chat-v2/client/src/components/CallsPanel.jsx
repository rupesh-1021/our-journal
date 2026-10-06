import React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Video,
} from "lucide-react";

function duration(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function CallsPanel({
  calls,
  me,
  partner,
  profileUrl,
  onVoiceCall,
  onVideoCall,
}) {
  const completed = calls.filter((c) => c.status === "completed");
  const missed = calls.filter(
    (c) => c.status === "missed" && Number(c.calleeId) === Number(me?.id),
  );
  const totalSeconds = completed.reduce(
    (sum, c) => sum + (Number(c.durationSeconds) || 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500">Total calls</div>
          <div className="mt-1 text-2xl font-bold">{calls.length}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500">Talk time</div>
          <div className="mt-1 text-lg font-bold">{duration(totalSeconds)}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500">Missed</div>
          <div className="mt-1 text-2xl font-bold">{missed.length}</div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-3">
          {profileUrl ? (
            <img
              src={profileUrl}
              className="h-12 w-12 rounded-full object-cover"
              alt=""
            />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-500 font-bold">
              {String(partner?.username || "?")
                .slice(0, 1)
                .toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold">
              {partner?.username || "Partner"}
            </div>
            <div className="text-xs text-zinc-500">Start a new call</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onVoiceCall}
            className="rounded-full bg-zinc-800 p-3 hover:bg-zinc-700"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={onVideoCall}
            className="rounded-full bg-zinc-800 p-3 hover:bg-zinc-700"
          >
            <Video size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {calls.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No calls yet.
          </div>
        ) : (
          calls.map((c) => {
            const outgoing = Number(c.callerId) === Number(me?.id);
            const isMissed = c.status === "missed";
            const isDeclined = c.status === "declined";
            const Icon = isMissed ? PhoneMissed : PhoneIncoming;

            return (
              <div
                key={c.id}
                className="flex items-center gap-3 border-b border-zinc-800 p-4 last:border-b-0"
              >
                <div
                  className={`grid h-10 w-10 place-items-center rounded-full ${isMissed ? "bg-red-500/15 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}
                >
                  {c.callType === "video" ? (
                    <Video size={18} />
                  ) : (
                    <Icon size={18} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {outgoing ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownLeft size={14} />
                    )}
                    <span>
                      {outgoing ? "Outgoing" : "Incoming"} {c.callType} call
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {new Date(c.startedAt).toLocaleString()}
                    {" · "}
                    {c.status === "completed"
                      ? duration(c.durationSeconds)
                      : isDeclined
                        ? "Declined"
                        : isMissed
                          ? "Missed"
                          : c.status}
                  </div>
                </div>

                {c.status === "completed" && (
                  <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Clock3 size={13} />
                    {duration(c.durationSeconds)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
