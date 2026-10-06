import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import {
  Send,
  Paperclip,
  Phone,
  Video,
  LogOut,
  LockKeyhole,
  Image as ImageIcon,
  Film,
  Camera,
  Trash2,
  Pin,
  MessageCircle,
  History,
} from "lucide-react";

import Login from "./components/Login";
import SecretGate from "./components/SecretGate";
import CallModal from "./components/CallModal";
import IncomingCall from "./components/IncomingCall";
import CallsPanel from "./components/CallsPanel";

import { api, API, token } from "./services/api";

import {
  encryptText,
  decryptText,
  encryptFile,
  decryptFile,
} from "./crypto/e2ee";

const SOCKET = import.meta.env.VITE_SOCKET_URL || "http://localhost:8080";

export default function App() {
  const [me, setMe] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  const [secret, setSecret] = useState(
    sessionStorage.getItem("chatSecret") || "",
  );

  const [socket, setSocket] = useState(null);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);

  // True only while the partner is actively viewing the chat
  const [partnerViewing, setPartnerViewing] = useState(false);

  // Active call
  const [call, setCall] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Incoming call waiting for Accept / Decline
  const [incomingCall, setIncomingCall] = useState(null);
  const [acceptingCall, setAcceptingCall] = useState(false);

  // Call history / controls
  const [calls, setCalls] = useState([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const callStartedAtRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  // --------------------------------------------------
  // PROFILE PICTURES
  // --------------------------------------------------

  const [profiles, setProfiles] = useState([]);
  const [profileUrls, setProfileUrls] = useState({});
  const [profileUploading, setProfileUploading] = useState(false);

  const profileUrlsRef = useRef({});
  const profileInputRef = useRef(null);

  const partner = profiles.find((user) => Number(user.id) !== Number(me?.id));

  const myProfile = profiles.find((user) => Number(user.id) === Number(me?.id));

  const partnerProfileUrl = partner ? profileUrls[partner.id] : null;

  const myProfileUrl = myProfile ? profileUrls[myProfile.id] : null;

  // Stores temporary browser URLs for decrypted images/videos
  const [mediaUrls, setMediaUrls] = useState({});

  // Per-message media status: loading | ready | error
  const [mediaStates, setMediaStates] = useState({});

  // Keep a ref so async preview loading can avoid duplicates
  const mediaUrlsRef = useRef({});

  const pc = useRef(null);
  const localStream = useRef(null);
  const bottom = useRef(null);
  const typingTimer = useRef(null);

  // ICE candidates can arrive before the remote description is ready.
  const pendingIceCandidates = useRef([]);

  // --------------------------------------------------
  // LOAD CURRENT USER
  // --------------------------------------------------

  useEffect(() => {
    if (!token()) {
      return;
    }

    api("/api/auth/me")
      .then((data) => {
        setMe(data.user);
      })
      .catch(() => {
        localStorage.removeItem("token");
      });
  }, []);

  // --------------------------------------------------
  // PROFILE HELPERS
  // --------------------------------------------------

  function initials(username) {
    const value = String(username || "?").trim();

    if (!value) {
      return "?";
    }

    return value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  async function loadProfilePicture(user) {
    if (!user?.profilePicture) {
      return;
    }

    const key = `${user.id}:${user.profilePicture}`;

    if (profileUrlsRef.current[key]) {
      setProfileUrls((current) => ({
        ...current,
        [user.id]: profileUrlsRef.current[key],
      }));

      return;
    }

    try {
      const response = await fetch(
        `${API}/api/profile/picture/${encodeURIComponent(user.profilePicture)}`,
        {
          headers: {
            Authorization: `Bearer ${token()}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Profile picture download failed (${response.status}).`,
        );
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Remove older object URLs belonging to this user.
      Object.entries(profileUrlsRef.current).forEach(
        ([existingKey, existingUrl]) => {
          if (existingKey.startsWith(`${user.id}:`) && existingKey !== key) {
            URL.revokeObjectURL(existingUrl);
            delete profileUrlsRef.current[existingKey];
          }
        },
      );

      profileUrlsRef.current[key] = objectUrl;

      setProfileUrls((current) => ({
        ...current,
        [user.id]: objectUrl,
      }));
    } catch (error) {
      console.error("Unable to load profile picture:", error);
    }
  }

  async function loadProfiles() {
    try {
      const data = await api("/api/profile/users");

      const users = Array.isArray(data.users) ? data.users : [];

      setProfiles(users);

      // Clear displayed URLs for users who no longer
      // have a profile picture.
      setProfileUrls((current) => {
        const next = { ...current };

        users.forEach((user) => {
          if (!user.profilePicture) {
            delete next[user.id];
          }
        });

        return next;
      });

      await Promise.all(users.map((user) => loadProfilePicture(user)));
    } catch (error) {
      console.error("Unable to load profiles:", error);
    }
  }

  // --------------------------------------------------
  // LOAD PROFILES
  // --------------------------------------------------

  useEffect(() => {
    if (!me) {
      return;
    }

    loadProfiles();
  }, [me]);

  // --------------------------------------------------
  // UPLOAD / CHANGE PROFILE PICTURE
  // --------------------------------------------------

  async function uploadProfilePicture(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      alert("Please choose a JPG, PNG or WEBP image.");

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Profile picture must be 5 MB or smaller.");

      return;
    }

    setProfileUploading(true);

    try {
      const formData = new FormData();

      formData.append("picture", file);

      await api("/api/profile/picture", {
        method: "POST",
        body: formData,
      });

      await loadProfiles();

      socket?.emit("profile:updated");
    } catch (error) {
      console.error("Unable to upload profile picture:", error);

      alert(error?.message || "Unable to update profile picture.");
    } finally {
      setProfileUploading(false);
    }
  }

  // --------------------------------------------------
  // REMOVE PROFILE PICTURE
  // --------------------------------------------------

  async function removeProfilePicture() {
    if (!myProfile?.profilePicture) {
      return;
    }

    const confirmed = window.confirm("Remove your profile picture?");

    if (!confirmed) {
      return;
    }

    setProfileUploading(true);

    try {
      await api("/api/profile/picture", {
        method: "DELETE",
      });

      await loadProfiles();

      socket?.emit("profile:updated");
    } catch (error) {
      console.error("Unable to remove profile picture:", error);

      alert(error?.message || "Unable to remove profile picture.");
    } finally {
      setProfileUploading(false);
    }
  }

  // --------------------------------------------------
  // DECRYPT MESSAGE
  // --------------------------------------------------

  async function decode(message, currentSecret = secret) {
    if (!currentSecret) {
      return {
        ...message,
        plain: "🔒 Locked",
      };
    }

    try {
      if (message.type === "text") {
        const plain = await decryptText(
          message.ciphertext,
          message.iv,
          message.salt,
          currentSecret,
        );

        return {
          ...message,
          plain,
        };
      }

      return {
        ...message,
        plain: null,
      };
    } catch (error) {
      console.error("Unable to decrypt message:", error);

      return {
        ...message,
        plain: "🔒 Unable to decrypt",
      };
    }
  }

  // --------------------------------------------------
  // MESSAGE ACTIONS / CALL HISTORY HELPERS
  // --------------------------------------------------

  function pinMessage(message) {
    if (!socket || !message?.id) return;
    socket.emit("message:pin", {
      messageId: message.id,
      pinned: !Boolean(message.isPinned),
    });
  }

  function deleteMessage(message) {
    if (!socket || !message?.id) return;
    const confirmed = window.confirm(
      message.type === "text"
        ? "Delete this message for both of you?"
        : "Delete this attachment for both of you?",
    );
    if (!confirmed) return;
    socket.emit("message:delete", { messageId: message.id });
  }

  async function loadCallHistory() {
    try {
      const data = await api("/api/messages/calls?limit=200");
      setCalls(Array.isArray(data.calls) ? data.calls : []);
    } catch (error) {
      console.error("Unable to load call history:", error);
    }
  }

  function upsertCallLog(entry) {
    if (!entry?.id) return;
    setCalls((current) => {
      const next = current.filter((item) => item.id !== entry.id);
      return [entry, ...next].sort(
        (a, b) => new Date(b.startedAt) - new Date(a.startedAt),
      );
    });
  }

  function formatCallDuration(totalSeconds = 0) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  function formatLiveDuration(totalSeconds = 0) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function toggleMute() {
    const audioTrack = localStream.current?.getAudioTracks?.()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  }

  function toggleCamera() {
    const videoTrack = localStream.current?.getVideoTracks?.()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setCameraOff(!videoTrack.enabled);
  }

  // --------------------------------------------------
  // SOCKET.IO
  // --------------------------------------------------

  useEffect(() => {
    if (!me || !secret) {
      return;
    }

    let active = true;

    // Load existing messages
    api("/api/messages?limit=200")
      .then(async (data) => {
        const decodedMessages = await Promise.all(
          data.messages.map((message) => decode(message)),
        );

        if (active) {
          setMessages(decodedMessages);
        }
      })
      .catch((error) => {
        console.error("Unable to load messages:", error);
      });

    loadCallHistory();

    // Connect Socket.IO
    const newSocket = io(SOCKET, {
      auth: {
        token: token(),
      },
    });

    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);
    });
    // --------------------------------------------------
    // CHAT COMPOSER ACTIVITY
    // --------------------------------------------------
    // chat:active now means the message box is focused.
    // The input onFocus/onBlur handlers below emit this state.

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
    });

    // Partner presence
    newSocket.on("presence", (data) => {
      setOnline(Boolean(data.online));
      setPartnerViewing(Boolean(data.viewing));
    });

    // Typing indicator
    newSocket.on("typing", (value) => {
      setTyping(Boolean(value));
    });

    // Partner changed/removed their profile picture.
    // Re-fetch trusted profile information from the API.
    newSocket.on("profile:updated", () => {
      loadProfiles();
    });

    // New message
    newSocket.on("message:new", async (message) => {
      const decodedMessage = await decode(message);

      setMessages((currentMessages) => [...currentMessages, decodedMessage]);
    });

    newSocket.on(
      "message:pinned",
      ({ messageId, isPinned, pinnedBy, pinnedAt }) => {
        setMessages((current) =>
          current.map((message) =>
            Number(message.id) === Number(messageId)
              ? { ...message, isPinned, pinnedBy, pinnedAt }
              : message,
          ),
        );
      },
    );

    newSocket.on("message:deleted", ({ messageId }) => {
      const existingUrl = mediaUrlsRef.current[messageId];
      if (existingUrl && existingUrl !== "loading") {
        URL.revokeObjectURL(existingUrl);
      }
      delete mediaUrlsRef.current[messageId];
      setMediaUrls((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      setMediaStates((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      setMessages((current) =>
        current.filter((message) => Number(message.id) !== Number(messageId)),
      );
    });

    newSocket.on("call:log", (entry) => {
      upsertCallLog(entry);
    });

    // --------------------------------------------------
    // INCOMING CALL
    // --------------------------------------------------

    newSocket.on("call:offer", ({ offer, video, callId }) => {
      console.log("Incoming call offer received:", {
        video,
      });

      // IMPORTANT:
      // Do not use window.confirm().
      // Store the offer and display our own incoming call UI.
      setIncomingCall({
        offer,
        video: Boolean(video),
        callId,
        socket: newSocket,
      });
    });

    // --------------------------------------------------
    // CALL ANSWER
    // --------------------------------------------------

    newSocket.on("call:answer", async ({ answer, callId }) => {
      try {
        if (!pc.current) {
          return;
        }

        console.log("Call answer received.");

        await pc.current.setRemoteDescription(
          new RTCSessionDescription(answer),
        );

        await flushPendingIceCandidates();

        callStartedAtRef.current = Date.now();
        setCallSeconds(0);
        setCall((current) =>
          current ? { ...current, callId: callId || current.callId } : current,
        );
      } catch (error) {
        console.error("Unable to process call answer:", error);
      }
    });

    // --------------------------------------------------
    // ICE CANDIDATE
    // --------------------------------------------------

    newSocket.on("call:ice", async ({ candidate }) => {
      try {
        if (!candidate) {
          return;
        }

        // Peer connection might not exist yet if the incoming
        // call is still waiting for the user to press Accept.
        if (!pc.current || !pc.current.remoteDescription) {
          pendingIceCandidates.current.push(candidate);
          return;
        }

        await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Unable to add ICE candidate:", error);
      }
    });

    // --------------------------------------------------
    // CALL ENDED
    // --------------------------------------------------

    newSocket.on("call:end", () => {
      console.log("Partner ended the call.");

      cleanupCall();
    });

    // --------------------------------------------------
    // CALL REJECTED
    // --------------------------------------------------

    newSocket.on("call:reject", () => {
      console.log("Partner declined the call.");

      alert("Call declined.");

      cleanupCall();
    });

    return () => {
      active = false;
      newSocket.emit("chat:active", false);
      newSocket.disconnect();
    };
  }, [me, secret]);

  // --------------------------------------------------
  // SCROLL TO LATEST MESSAGE
  // --------------------------------------------------

  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // --------------------------------------------------
  // LOAD INLINE MEDIA PREVIEW
  // --------------------------------------------------

  async function loadMediaPreview(message, force = false) {
    if (!message || message.type === "text" || !secret) {
      return;
    }

    const existing = mediaUrlsRef.current[message.id];

    if (!force && existing) {
      return;
    }

    if (force && existing && existing !== "loading") {
      URL.revokeObjectURL(existing);
      delete mediaUrlsRef.current[message.id];

      setMediaUrls((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
    }

    mediaUrlsRef.current[message.id] = "loading";

    setMediaStates((current) => ({
      ...current,
      [message.id]: { status: "loading", error: null },
    }));

    try {
      const response = await fetch(
        `${API}/api/media/${encodeURIComponent(message.ciphertext)}`,
        {
          headers: {
            Authorization: `Bearer ${token()}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Your session is no longer authorized. Please sign in again.",
          );
        }

        if (response.status === 404) {
          throw new Error(
            "The encrypted media file could not be found on the server.",
          );
        }

        throw new Error(`Media download failed (${response.status}).`);
      }

      const encryptedBuffer = await response.arrayBuffer();

      let blob;

      try {
        blob = await decryptFile(
          encryptedBuffer,
          message.iv,
          message.salt,
          secret,
          message.mime,
        );
      } catch (error) {
        console.error("Media decryption failed:", error);
        throw new Error(
          "This media could not be decrypted. Check that the same chat passphrase is being used.",
        );
      }

      const objectUrl = URL.createObjectURL(blob);
      mediaUrlsRef.current[message.id] = objectUrl;

      setMediaUrls((current) => ({
        ...current,
        [message.id]: objectUrl,
      }));

      setMediaStates((current) => ({
        ...current,
        [message.id]: { status: "ready", error: null },
      }));
    } catch (error) {
      console.error("Unable to load media preview:", error);
      delete mediaUrlsRef.current[message.id];

      setMediaStates((current) => ({
        ...current,
        [message.id]: {
          status: "error",
          error: error?.message || "Unable to load this attachment.",
        },
      }));
    }
  }

  function retryMedia(message) {
    loadMediaPreview(message, true);
  }

  // Automatically decrypt image/video previews
  useEffect(() => {
    if (!secret) {
      return;
    }

    messages.forEach((message) => {
      if (message.type !== "text") {
        loadMediaPreview(message);
      }
    });
  }, [messages, secret]);

  // Clean up temporary object URLs when App unmounts
  useEffect(() => {
    return () => {
      Object.values(mediaUrlsRef.current).forEach((url) => {
        if (url && url !== "loading") {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  // --------------------------------------------------
  // WEBRTC - MEDIA
  // --------------------------------------------------

  async function startMedia(video) {
    // Stop any previous local stream first
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        track.stop();
      });

      localStream.current = null;
    }

    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,

        // Voice-oriented mono audio
        channelCount: 1,

        // Preferred voice sample rate.
        // Browser may choose another supported value.
        sampleRate: 48000,

        // Helps browsers that support this constraint
        sampleSize: 16,
      },

      video: video
        ? {
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
            frameRate: {
              ideal: 24,
              max: 30,
            },
            facingMode: "user",
          }
        : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      localStream.current = stream;

      // Log actual settings selected by the browser.
      // Useful while we are developing/testing.
      const audioTrack = stream.getAudioTracks()[0];

      if (audioTrack) {
        console.log("Microphone settings:", audioTrack.getSettings());
      }

      const videoTrack = stream.getVideoTracks()[0];

      if (videoTrack) {
        console.log("Camera settings:", videoTrack.getSettings());
      }

      return stream;
    } catch (error) {
      console.error("Unable to access microphone/camera:", error);

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        throw new Error(
          video
            ? "Microphone or camera permission was denied. Please allow microphone and camera access."
            : "Microphone permission was denied. Please allow microphone access.",
        );
      }

      if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        throw new Error(
          video
            ? "A microphone or camera could not be found."
            : "A microphone could not be found.",
        );
      }

      if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        throw new Error(
          video
            ? "The microphone or camera could not be started. Close other camera/mic apps or test the second account on another device."
            : "The microphone could not be started. Close other apps/tabs using it or test the second account on another device.",
        );
      }

      throw error;
    }
  }

  // --------------------------------------------------
  // WEBRTC - PEER CONNECTION
  // --------------------------------------------------

  async function createPC(socketInstance = socket) {
    if (!socketInstance) {
      throw new Error("Socket connection is not available.");
    }

    if (pc.current) {
      try {
        pc.current.close();
      } catch (error) {
        console.error("Unable to close previous peer connection:", error);
      }

      pc.current = null;
    }

    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    pc.current = peer;

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStream.current);
      });
    }

    peer.ontrack = (event) => {
      console.log("Remote media track received.");

      const stream = event.streams?.[0];

      if (stream) {
        setRemoteStream(stream);
        return;
      }

      // Fallback in case the browser does not provide
      // event.streams[0].
      setRemoteStream((current) => {
        const next = current || new MediaStream();

        next.addTrack(event.track);

        return next;
      });
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketInstance.emit("call:ice", {
          candidate: event.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;

      console.log("WebRTC connection state:", state);

      if (state === "failed") {
        console.error("WebRTC connection failed.");
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", peer.iceConnectionState);
    };

    return peer;
  }

  // --------------------------------------------------
  // ADD ICE CANDIDATES THAT ARRIVED EARLY
  // --------------------------------------------------

  async function flushPendingIceCandidates() {
    if (!pc.current || !pc.current.remoteDescription) {
      return;
    }

    const candidates = [...pendingIceCandidates.current];

    pendingIceCandidates.current = [];

    for (const candidate of candidates) {
      try {
        await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Unable to add queued ICE candidate:", error);
      }
    }
  }

  // --------------------------------------------------
  // START OUTGOING CALL
  // --------------------------------------------------

  async function startCall(video) {
    if (!socket) {
      alert("Chat server is not connected.");
      return;
    }

    if (!online) {
      alert("Your partner is offline.");
      return;
    }

    if (call || incomingCall) {
      return;
    }

    try {
      pendingIceCandidates.current = [];

      await startMedia(video);

      const peer = await createPC(socket);

      const offer = await peer.createOffer();

      await peer.setLocalDescription(offer);

      const callId = crypto.randomUUID();

      socket.emit("call:offer", {
        callId,
        offer: peer.localDescription,
        video: Boolean(video),
      });

      setMuted(false);
      setCameraOff(false);
      setCallSeconds(0);
      callStartedAtRef.current = null;

      setCall({
        callId,
        video: Boolean(video),
        outgoing: true,
      });

      console.log(`${video ? "Video" : "Voice"} call started.`);
    } catch (error) {
      console.error("Unable to start call:", error);

      alert(`Unable to start call: ${error?.message || "Unknown error"}`);

      cleanupCall();
    }
  }

  // --------------------------------------------------
  // ACCEPT INCOMING CALL
  // --------------------------------------------------

  async function acceptIncomingCall() {
    if (!incomingCall || acceptingCall) {
      return;
    }

    const { offer, video, callId, socket: callSocket } = incomingCall;

    setAcceptingCall(true);

    try {
      console.log("Accepting incoming call...");

      pendingIceCandidates.current = [];

      // Because this is triggered directly by clicking
      // Accept, the browser can request microphone/camera.
      await startMedia(video);

      const peer = await createPC(callSocket);

      await peer.setRemoteDescription(new RTCSessionDescription(offer));

      await flushPendingIceCandidates();

      const answer = await peer.createAnswer();

      await peer.setLocalDescription(answer);

      callSocket.emit("call:answer", {
        callId,
        answer: peer.localDescription,
      });

      setIncomingCall(null);

      setMuted(false);
      setCameraOff(false);
      setCallSeconds(0);
      callStartedAtRef.current = Date.now();

      setCall({
        callId,
        video: Boolean(video),
        outgoing: false,
      });

      console.log("Incoming call accepted.");
    } catch (error) {
      console.error("Unable to accept call:", error);

      alert(`Unable to accept call: ${error?.message || "Unknown error"}`);

      callSocket?.emit("call:reject", { callId });

      setIncomingCall(null);

      cleanupCall();
    } finally {
      setAcceptingCall(false);
    }
  }

  // --------------------------------------------------
  // DECLINE INCOMING CALL
  // --------------------------------------------------

  function rejectIncomingCall() {
    if (!incomingCall) {
      return;
    }

    console.log("Incoming call declined.");

    incomingCall.socket?.emit("call:reject", { callId: incomingCall.callId });

    setIncomingCall(null);
    setAcceptingCall(false);

    cleanupCall();
  }

  // --------------------------------------------------
  // CLEAN UP CALL
  // --------------------------------------------------

  function cleanupCall() {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        track.stop();
      });
    }

    localStream.current = null;

    if (pc.current) {
      try {
        pc.current.close();
      } catch (error) {
        console.error("Unable to close peer connection:", error);
      }
    }

    pc.current = null;

    pendingIceCandidates.current = [];

    setRemoteStream(null);
    setCall(null);
    setIncomingCall(null);
    setAcceptingCall(false);
    setMuted(false);
    setCameraOff(false);
    setCallSeconds(0);
    callStartedAtRef.current = null;
  }

  // --------------------------------------------------
  // END ACTIVE CALL
  // --------------------------------------------------

  function endCall() {
    socket?.emit("call:end", { callId: call?.callId });
    cleanupCall();
  }

  useEffect(() => {
    if (!call || !callStartedAtRef.current) return;

    const update = () => {
      setCallSeconds(
        Math.floor((Date.now() - callStartedAtRef.current) / 1000),
      );
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [call?.callId]);

  // --------------------------------------------------
  // SEND TEXT MESSAGE
  // --------------------------------------------------

  async function send(event) {
    event.preventDefault();

    const value = text.trim();

    if (!value || !socket || !secret) {
      return;
    }

    try {
      const encrypted = await encryptText(value, secret);

      socket.emit("message:send", {
        type: "text",
        ...encrypted,
      });

      setText("");

      socket.emit("typing", false);
    } catch (error) {
      console.error("Unable to encrypt/send message:", error);

      alert("Unable to send message.");
    }
  }

  // --------------------------------------------------
  // TYPING
  // --------------------------------------------------

  function onType(value) {
    setText(value);

    if (!socket) {
      return;
    }

    socket.emit("typing", true);

    clearTimeout(typingTimer.current);

    typingTimer.current = setTimeout(() => {
      socket.emit("typing", false);
    }, 900);
  }

  // --------------------------------------------------
  // IMAGE / VIDEO UPLOAD
  // --------------------------------------------------

  async function upload(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const maxSize = 25 * 1024 * 1024;

    if (file.size > maxSize) {
      alert("Maximum attachment size is 25 MB in this starter.");
      return;
    }

    if (!socket) {
      alert("Chat server is not connected.");
      return;
    }

    if (!secret) {
      alert("Unlock the chat first.");
      return;
    }

    setUploading(true);

    try {
      // Encrypt locally before upload
      const encrypted = await encryptFile(file, secret);

      const formData = new FormData();

      formData.append("file", encrypted.blob, `${file.name}.enc`);

      // Upload encrypted bytes
      const uploaded = await api("/api/media", {
        method: "POST",
        body: formData,
      });

      const type = file.type.startsWith("video/") ? "video" : "image";

      // Send only encrypted attachment information
      socket.emit("message:send", {
        type,
        ciphertext: uploaded.storageKey,
        iv: encrypted.iv,
        salt: encrypted.salt,
        mime: file.type,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (error) {
      console.error("Upload failed:", error);

      alert(error.message);
    } finally {
      setUploading(false);
    }
  }

  // --------------------------------------------------
  // OPEN ENCRYPTED MEDIA
  // --------------------------------------------------

  async function openMedia(message) {
    try {
      // If the media has already been decrypted for the
      // inline preview, reuse the browser object URL.
      const existingUrl = mediaUrlsRef.current[message.id];

      if (existingUrl && existingUrl !== "loading") {
        window.open(existingUrl, "_blank", "noopener,noreferrer");

        return;
      }

      const response = await fetch(
        `${API}/api/media/${encodeURIComponent(message.ciphertext)}`,
        {
          headers: {
            Authorization: `Bearer ${token()}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Download failed.");
      }

      const encryptedBuffer = await response.arrayBuffer();

      const blob = await decryptFile(
        encryptedBuffer,
        message.iv,
        message.salt,
        secret,
        message.mime,
      );

      const objectUrl = URL.createObjectURL(blob);

      window.open(objectUrl, "_blank", "noopener,noreferrer");

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    } catch (error) {
      console.error("Unable to open attachment:", error);

      alert(error.message);
    }
  }

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  function logout() {
    socket?.disconnect();

    cleanupCall();

    Object.values(mediaUrlsRef.current).forEach((url) => {
      if (url && url !== "loading") {
        URL.revokeObjectURL(url);
      }
    });

    mediaUrlsRef.current = {};
    setMediaUrls({});
    setMediaStates({});

    Object.values(profileUrlsRef.current).forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });

    profileUrlsRef.current = {};
    setProfileUrls({});
    setProfiles([]);

    localStorage.removeItem("token");

    sessionStorage.removeItem("chatSecret");

    window.location.reload();
  }

  // --------------------------------------------------
  // LOGIN SCREEN
  // --------------------------------------------------

  if (!me) {
    return (
      <Login
        onLogin={(user) => {
          setMe(user);
        }}
      />
    );
  }

  // --------------------------------------------------
  // CHAT UI
  // --------------------------------------------------

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-white">
      {!secret && (
        <SecretGate
          onUnlock={(value) => {
            sessionStorage.setItem("chatSecret", value);

            setSecret(value);
          }}
        />
      )}

      {/* HEADER */}

      <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-4 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          {/* Partner avatar */}

          <div className="relative h-10 w-10 shrink-0">
            {partnerProfileUrl ? (
              <img
                src={partnerProfileUrl}
                alt={partner?.username || "Partner"}
                className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 text-sm font-bold text-white">
                {initials(partner?.username)}
              </div>
            )}

            {online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-400" />
            )}
          </div>

          <div className="min-w-0">
            <div className="truncate font-bold">
              {partner?.username || "Between Us"}
            </div>

            <div
              className={`text-xs ${
                online ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              {!online
                ? "offline"
                : typing
                  ? "● typing…"
                  : partnerViewing
                    ? "● in chat"
                    : "● online"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* MY PROFILE PICTURE */}

          <input
            ref={profileInputRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={uploadProfilePicture}
          />

          <div className="group relative">
            <button
              type="button"
              disabled={profileUploading}
              onClick={() => profileInputRef.current?.click()}
              className="relative h-10 w-10 overflow-hidden rounded-full bg-zinc-800 transition hover:ring-2 hover:ring-rose-400 disabled:opacity-40"
              title={
                myProfile?.profilePicture
                  ? "Change profile picture"
                  : "Add profile picture"
              }
            >
              {myProfileUrl ? (
                <img
                  src={myProfileUrl}
                  alt={me.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-xs font-bold">
                  {initials(me.username)}
                </span>
              )}

              <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100">
                <Camera size={16} />
              </span>
            </button>

            {myProfile?.profilePicture && (
              <button
                type="button"
                disabled={profileUploading}
                onClick={removeProfilePicture}
                className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-red-600 shadow transition hover:bg-red-500 disabled:opacity-40"
                title="Remove profile picture"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>

          {/* Voice call */}

          <button
            type="button"
            disabled={!online || Boolean(call) || Boolean(incomingCall)}
            onClick={() => startCall(false)}
            className="rounded-xl bg-zinc-800 p-2.5 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            title="Voice call"
          >
            <Phone size={18} />
          </button>

          {/* Video call */}

          <button
            type="button"
            disabled={!online || Boolean(call) || Boolean(incomingCall)}
            onClick={() => startCall(true)}
            className="rounded-xl bg-zinc-800 p-2.5 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            title="Video call"
          >
            <Video size={18} />
          </button>

          {/* Logout */}

          <button
            type="button"
            onClick={logout}
            className="rounded-xl bg-zinc-800 p-2.5 transition hover:bg-zinc-700"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ENCRYPTION NOTICE */}

      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-2 text-center text-xs text-zinc-400">
        <LockKeyhole size={12} className="mr-1 inline" />
        Content is encrypted in the browser before storage.
      </div>

      <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <div className="mx-auto flex max-w-3xl gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition ${activeTab === "chat" ? "bg-rose-500 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <MessageCircle size={16} /> Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calls")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition ${activeTab === "calls" ? "bg-rose-500 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <History size={16} /> Calls
          </button>
        </div>
      </div>

      {/* MESSAGES */}

      {activeTab === "chat" ? (
        <>
          <main className="scrollbar flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-3xl space-y-3">
              {calls.slice(0, 5).map((entry) => {
                const outgoing = Number(entry.callerId) === Number(me.id);
                const label =
                  entry.status === "completed"
                    ? `${outgoing ? "Outgoing" : "Incoming"} ${entry.callType} call · ${formatCallDuration(entry.durationSeconds)}`
                    : entry.status === "missed"
                      ? `Missed ${entry.callType} call`
                      : entry.status === "declined"
                        ? `Declined ${entry.callType} call`
                        : `${outgoing ? "Outgoing" : "Incoming"} ${entry.callType} call · ${entry.status}`;
                return (
                  <div
                    key={`call-${entry.id}`}
                    className="flex justify-center py-1"
                  >
                    <div
                      className={`rounded-full border px-4 py-2 text-xs ${entry.status === "missed" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-zinc-800 bg-zinc-900 text-zinc-400"}`}
                    >
                      {entry.callType === "video" ? "📹" : "📞"} {label} ·{" "}
                      {new Date(entry.startedAt).toLocaleString()}
                    </div>
                  </div>
                );
              })}

              {messages.map((message) => {
                const mine = message.senderId === me.id;

                const mediaUrl = mediaUrls[message.id];
                const mediaState = mediaStates[message.id];

                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl ${
                        message.type === "text" ? "px-4 py-3" : "p-2"
                      } text-left shadow ${
                        mine
                          ? "rounded-br-md bg-rose-500"
                          : "rounded-bl-md bg-zinc-800"
                      }`}
                    >
                      {/* TEXT */}

                      {message.type === "text" && (
                        <div className="whitespace-pre-wrap break-words">
                          {message.plain}
                        </div>
                      )}

                      {/* IMAGE */}

                      {message.type === "image" && (
                        <div className="max-w-full">
                          {mediaUrl ? (
                            <button
                              type="button"
                              onClick={() => openMedia(message)}
                              className="block max-w-full text-left"
                              title="Open image"
                            >
                              <img
                                src={mediaUrl}
                                alt={message.fileName || "Shared image"}
                                className="max-h-[420px] max-w-full rounded-xl object-contain"
                              />
                            </button>
                          ) : mediaState?.status === "error" ? (
                            <div className="flex min-h-32 min-w-48 flex-col items-center justify-center gap-3 rounded-xl bg-black/20 px-5 py-6 text-center">
                              <ImageIcon size={24} />
                              <div className="max-w-64 text-xs text-white/80">
                                {mediaState.error}
                              </div>
                              <button
                                type="button"
                                onClick={() => retryMedia(message)}
                                className="rounded-full bg-white/15 px-4 py-2 text-xs font-medium transition hover:bg-white/25"
                              >
                                Retry
                              </button>
                            </div>
                          ) : (
                            <div className="flex min-h-32 min-w-48 items-center justify-center gap-2 rounded-xl bg-black/20 px-5 py-8">
                              <ImageIcon size={22} />
                              <span className="text-sm">Decrypting image…</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* VIDEO */}

                      {message.type === "video" && (
                        <div>
                          {mediaUrl ? (
                            <video
                              src={mediaUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="max-h-[420px] max-w-full rounded-xl"
                            >
                              Your browser does not support video playback.
                            </video>
                          ) : mediaState?.status === "error" ? (
                            <div className="flex min-h-32 min-w-48 flex-col items-center justify-center gap-3 rounded-xl bg-black/20 px-5 py-6 text-center">
                              <Film size={24} />
                              <div className="max-w-64 text-xs text-white/80">
                                {mediaState.error}
                              </div>
                              <button
                                type="button"
                                onClick={() => retryMedia(message)}
                                className="rounded-full bg-white/15 px-4 py-2 text-xs font-medium transition hover:bg-white/25"
                              >
                                Retry
                              </button>
                            </div>
                          ) : (
                            <div className="flex min-h-32 min-w-48 items-center justify-center gap-2 rounded-xl bg-black/20 px-5 py-8">
                              <Film size={22} />
                              <span className="text-sm">Decrypting video…</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* MEDIA FILE NAME */}

                      {message.type !== "text" && message.fileName && (
                        <div className="mt-2 max-w-[420px] truncate px-1 text-xs opacity-70">
                          {message.fileName}
                        </div>
                      )}

                      {message.isPinned && (
                        <div className="mt-2 flex items-center gap-1 px-1 text-[10px] font-medium text-amber-200/90">
                          <Pin size={11} /> Pinned
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-end gap-1 border-t border-white/10 pt-2">
                        <button
                          type="button"
                          onClick={() => pinMessage(message)}
                          className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                          title={message.isPinned ? "Unpin" : "Pin"}
                        >
                          <Pin
                            size={14}
                            className={message.isPinned ? "fill-current" : ""}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMessage(message)}
                          className="rounded-lg p-1.5 text-white/70 transition hover:bg-red-500/20 hover:text-red-200"
                          title="Delete for everyone"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* TIME */}

                      <div
                        className={`mt-1 text-[10px] opacity-60 ${
                          message.type !== "text" ? "px-1" : ""
                        }`}
                      >
                        {new Date(message.createdAt).toLocaleString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* TYPING */}

              {/* PARTNER CHAT ACTIVITY */}

              {online && (typing || partnerViewing) && (
                <div className="flex items-end gap-2 py-1">
                  {/* Temporary avatar until we implement profile pictures */}
                  <div className="relative h-8 w-8 shrink-0">
                    {partnerProfileUrl ? (
                      <img
                        src={partnerProfileUrl}
                        alt={partner?.username || "Partner"}
                        className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
                      />
                    ) : (
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 text-[10px] font-bold text-white">
                        {initials(partner?.username)}
                      </div>
                    )}

                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-emerald-400" />
                  </div>

                  <div className="rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900/90 px-3 py-2 shadow">
                    {typing ? (
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-400" />

                        <span
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-400"
                          style={{
                            animationDelay: "120ms",
                          }}
                        />

                        <span
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-400"
                          style={{
                            animationDelay: "240ms",
                          }}
                        />

                        <span className="ml-1 text-xs text-zinc-400">
                          typing…
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{partner?.username || "Partner"}</span>

                        <span>in chat</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={bottom} />
            </div>
          </main>

          {/* MESSAGE COMPOSER */}

          <form onSubmit={send} className="border-t border-zinc-800 p-3">
            <div className="mx-auto flex max-w-3xl gap-2">
              {/* ATTACHMENT */}

              <label
                className={`cursor-pointer rounded-xl bg-zinc-800 p-3 transition hover:bg-zinc-700 ${
                  uploading ? "pointer-events-none opacity-40" : ""
                }`}
                title="Send image or video"
              >
                <Paperclip />

                <input
                  disabled={uploading}
                  hidden
                  type="file"
                  accept="image/*,video/*"
                  onChange={upload}
                />
              </label>

              {/* MESSAGE */}

              <input
                value={text}
                disabled={!secret}
                onChange={(event) => onType(event.target.value)}
                onFocus={() => socket?.emit("chat:active", true)}
                onBlur={() => {
                  socket?.emit("chat:active", false);
                  socket?.emit("typing", false);
                }}
                className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 outline-none transition focus:border-rose-500 disabled:opacity-50"
                placeholder={uploading ? "Encrypting/uploading…" : "Message…"}
              />

              {/* SEND */}

              <button
                type="submit"
                disabled={!text.trim() || !socket || !secret}
                className="rounded-xl bg-rose-500 p-3 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send />
              </button>
            </div>
          </form>
        </>
      ) : (
        <main className="scrollbar flex-1 overflow-y-auto">
          <CallsPanel
            calls={calls}
            me={me}
            partner={partner}
            profileUrl={partnerProfileUrl}
            onVoiceCall={() => startCall(false)}
            onVideoCall={() => startCall(true)}
          />
        </main>
      )}

      {/* INCOMING CALL */}

      {incomingCall && !call && (
        <IncomingCall
          video={incomingCall.video}
          accepting={acceptingCall}
          onAccept={acceptIncomingCall}
          onReject={rejectIncomingCall}
          profileUrl={partnerProfileUrl}
          partnerName={partner?.username || "Your partner"}
        />
      )}

      {/* ACTIVE CALL */}

      {call && (
        <CallModal
          video={call.video}
          localStream={localStream.current}
          remoteStream={remoteStream}
          onEnd={endCall}
          profileUrl={partnerProfileUrl}
          partnerName={partner?.username || "Your partner"}
          muted={muted}
          cameraOff={cameraOff}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          durationText={formatLiveDuration(callSeconds)}
        />
      )}
    </div>
  );
}
