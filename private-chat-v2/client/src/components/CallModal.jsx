import React, { useEffect, useRef } from "react";
import { Camera, CameraOff, Mic, MicOff, PhoneOff } from "lucide-react";

function V({ stream, muted, className }) {
  const ref = useRef();

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);

  return (
    <video ref={ref} autoPlay playsInline muted={muted} className={className} />
  );
}

export default function CallModal({
  video,
  localStream,
  remoteStream,
  onEnd,
  profileUrl = null,
  partnerName = "Your partner",
  muted = false,
  cameraOff = false,
  onToggleMute,
  onToggleCamera,
  durationText = "00:00",
}) {
  const initials = String(partnerName || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="relative grid flex-1 place-items-center overflow-hidden">
        {video ? (
          <>
            {remoteStream ? (
              <V stream={remoteStream} className="h-full w-full object-cover" />
            ) : (
              <div className="text-zinc-400">Connecting video…</div>
            )}

            {!cameraOff && (
              <V
                stream={localStream}
                muted
                className="absolute bottom-5 right-5 h-36 w-28 rounded-2xl border border-white/20 bg-zinc-900 object-cover shadow-xl"
              />
            )}

            <div className="absolute left-5 top-5 rounded-2xl bg-black/50 px-4 py-2 backdrop-blur">
              <div className="font-medium">{partnerName}</div>
              <div className="text-xs text-zinc-300">{durationText}</div>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-5 h-32 w-32 overflow-hidden rounded-full shadow-2xl ring-4 ring-rose-500/20">
              {profileUrl ? (
                <img
                  src={profileUrl}
                  alt={partnerName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 text-4xl font-bold">
                  {initials || "?"}
                </div>
              )}
            </div>

            <h2 className="text-2xl font-semibold">{partnerName}</h2>
            <p className="mt-2 text-zinc-400">
              {remoteStream ? `Connected · ${durationText}` : "Connecting…"}
            </p>

            <audio
              ref={(element) => {
                if (element) element.srcObject = remoteStream || null;
              }}
              autoPlay
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 p-8">
        <button
          type="button"
          onClick={onToggleMute}
          className={`rounded-full p-4 transition ${muted ? "bg-white text-black" : "bg-zinc-800 hover:bg-zinc-700"}`}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff /> : <Mic />}
        </button>

        {video && (
          <button
            type="button"
            onClick={onToggleCamera}
            className={`rounded-full p-4 transition ${cameraOff ? "bg-white text-black" : "bg-zinc-800 hover:bg-zinc-700"}`}
            title={cameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {cameraOff ? <CameraOff /> : <Camera />}
          </button>
        )}

        <button
          type="button"
          onClick={onEnd}
          className="rounded-full bg-red-600 p-5 transition hover:bg-red-500"
          title="End call"
        >
          <PhoneOff />
        </button>
      </div>
    </div>
  );
}
