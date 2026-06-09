import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField, Tooltip } from "@mui/material";
import { Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import styles from "../styles/videoComponent.module.css";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import PanToolAltIcon from "@mui/icons-material/PanToolAlt";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import LinkIcon from "@mui/icons-material/Link";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import SettingsIcon from "@mui/icons-material/Settings";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import server from "../environment";
import withAuth from "../utils/withAuth";
import { AuthContext } from "../contexts/AuthContext";

const server_url = server;
let connections = {};

const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const QUICK_REACTIONS = ["\u{1F44D}", "\u{1F44F}", "\u{1F525}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F389}"];

const VIDEO_QUALITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "360p", label: "360p (Data Saver)" },
  { value: "720p", label: "720p (HD)" },
];

const formatTime = (isoTime) => {
  if (!isoTime) return "";
  const date = new Date(isoTime);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
};

const ROOM_THREAD_KEY = "__room__";

const normalizeIncomingMessage = (payload, sender, socketIdSender) => {
  if (payload && typeof payload === "object") {
    return {
      id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: payload.type || "chat",
      text: payload.text || payload.data || "",
      sender: payload.sender || "System",
      socketId: payload.socketId || payload["socket-id-sender"] || socketIdSender || null,
      threadKey: payload.threadKey || payload.thread || null,
      toSocketId: payload.toSocketId || null,
      createdAt: payload.createdAt || new Date().toISOString(),
    };
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "chat",
    text: String(payload || ""),
    sender: sender || "Guest",
    socketId: socketIdSender || null,
    threadKey: socketIdSender || null,
    toSocketId: null,
    createdAt: new Date().toISOString(),
  };
};

function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const localTileRef = useRef();
  const typingTimeoutRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const speakingStateRef = useRef(false);
  const speakingTimeoutRef = useRef(null);
  const zoomDragViewportRef = useRef({ width: 0, height: 0 });
  const zoomDragLastRef = useRef({ x: 0, y: 0 });
  const spotlightVideoref = useRef(null);
  const hasAutoPinnedRef = useRef(false);
  const activeChatThreadRef = useRef("");
  const sidePanelRef = useRef("chat");
  const isPanelOpenRef = useRef(true);

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [screen, setScreen] = useState(false);
  const [screenAvailable, setScreenAvailable] = useState(false);

  const [chatThreads, setChatThreads] = useState({});
  const [activeChatThread, setActiveChatThread] = useState("");
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);

  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState(() => localStorage.getItem("meeting_display_name") || "");

  const [videos, setVideos] = useState([]);

  const [participants, setParticipants] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sidePanel, setSidePanel] = useState("chat");
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const [layoutMode, setLayoutMode] = useState("grid");
  const [pinnedSocketId, setPinnedSocketId] = useState(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [audioLockedByHost, setAudioLockedByHost] = useState(false);
  const [videoLockedByHost, setVideoLockedByHost] = useState(false);
  const [showReactionTray, setShowReactionTray] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [roomLocked, setRoomLocked] = useState(false);
  const [allowChat, setAllowChat] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);
  const [allowScreenShare, setAllowScreenShare] = useState(true);
  const [videoQuality, setVideoQuality] = useState("auto");
  const [waitingQueue, setWaitingQueue] = useState([]);
  const [unmuteRequests, setUnmuteRequests] = useState([]);
  const [waitingStatus, setWaitingStatus] = useState("admitted");
  const [mySocketIdState, setMySocketIdState] = useState("");
  const [meetingPassword, setMeetingPassword] = useState(new URLSearchParams(window.location.search).get("password") || "");
  const [meetingElapsed, setMeetingElapsed] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [fullscreenKey, setFullscreenKey] = useState("");
  const [localTilePosition, setLocalTilePosition] = useState({ x: null, y: null });
  const [isDraggingLocalTile, setIsDraggingLocalTile] = useState(false);
  const [activeSpeakerSocketId, setActiveSpeakerSocketId] = useState("");
  const [autoSpotlight, setAutoSpotlight] = useState(true);
  const [gridPage, setGridPage] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const [videoZoomLevel, setVideoZoomLevel] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const [isZoomDragging, setIsZoomDragging] = useState(false);
  const [isCompactHeader, setIsCompactHeader] = useState(() => window.innerWidth <= 980);
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);

  const { validateMeetingAccess, userData } = useContext(AuthContext);

  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const roomId = pathSegments[pathSegments.length - 1] || "default-room";

  const participantMap = useMemo(() => {
    const map = {};
    participants.forEach((participant) => {
      map[participant.socketId] = participant;
    });
    return map;
  }, [participants]);

  const mySocketId = mySocketIdState || socketIdRef.current;
  const pinnedVideo = pinnedSocketId ? videos.find((videoItem) => videoItem.socketId === pinnedSocketId) : null;
  const myRole = participantMap[mySocketId]?.role || "guest";
  const isHost = myRole === "host";
  const isCoHost = myRole === "cohost";
  const canModerate = isHost || isCoHost;
  const canUseChat = allowChat || canModerate;
  const canUseReactions = allowReactions || canModerate;
  const canShareScreen = allowScreenShare || canModerate;

  useEffect(() => {
    if (!mySocketId) return;
    const me = participantMap[mySocketId];
    if (!me) return;
    setAudioLockedByHost(Boolean(me.audioLocked));
    setVideoLockedByHost(Boolean(me.videoLocked));
  }, [participantMap, mySocketId]);

  useEffect(() => {
    activeChatThreadRef.current = activeChatThread;
  }, [activeChatThread]);

  useEffect(() => {
    sidePanelRef.current = sidePanel;
    isPanelOpenRef.current = isPanelOpen;
  }, [sidePanel, isPanelOpen]);

  useEffect(() => {
    setTypingUsers([]);
  }, [activeChatThread]);

  useEffect(() => {
    if (!mySocketId) return;

    if (!canModerate) {
      setActiveChatThread((prev) => prev || mySocketId);
      return;
    }

    setActiveChatThread((prev) => {
      const isValid =
        prev &&
        participants.some(
          (participant) =>
            participant.socketId === prev && !["host", "cohost"].includes(participant.role)
        );
      if (isValid) {
        return prev;
      }

      const firstNonMod = participants.find(
        (participant) =>
          participant.socketId !== mySocketId && !["host", "cohost"].includes(participant.role)
      );
      return firstNonMod?.socketId || prev || "";
    });
  }, [canModerate, mySocketId, participants]);

  const displayedVideos =
    layoutMode === "spotlight" && pinnedSocketId
      ? videos.filter((videoItem) => videoItem.socketId !== pinnedSocketId)
      : videos;
  const GRID_PAGE_SIZE = 6;
  const totalGridPages = Math.max(1, Math.ceil(displayedVideos.length / GRID_PAGE_SIZE));
  const pagedDisplayedVideos = displayedVideos.slice(
    gridPage * GRID_PAGE_SIZE,
    gridPage * GRID_PAGE_SIZE + GRID_PAGE_SIZE
  );
  const visibleVideoItems = layoutMode === "spotlight" ? displayedVideos : pagedDisplayedVideos;
  const singleGridZoomStyle =
    layoutMode === "grid" && pagedDisplayedVideos.length === 1
      ? {
          transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${videoZoomLevel})`,
          transformOrigin: "center center",
        }
      : undefined;
  const spotlightZoomStyle =
    layoutMode === "spotlight"
      ? {
          transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${videoZoomLevel})`,
          transformOrigin: "center center",
        }
      : undefined;

  useEffect(() => {
    if (hasAutoPinnedRef.current) {
      return;
    }

    if (!participants || participants.length === 0) {
      return;
    }

    const hostSocketId = participants.find((participant) => participant.role === "host")?.socketId;
    const candidate = hostSocketId || participants[0]?.socketId;
    if (!candidate) {
      return;
    }

    setPinnedSocketId(candidate);
    setLayoutMode("spotlight");
    hasAutoPinnedRef.current = true;
  }, [participants]);

  useEffect(() => {
    if (layoutMode !== "spotlight") {
      return;
    }

    if (pinnedSocketId) {
      return;
    }

    if (!participants || participants.length === 0) {
      return;
    }

    const hostSocketId = participants.find((participant) => participant.role === "host")?.socketId;
    const candidate = hostSocketId || participants[0]?.socketId;
    if (candidate) {
      setPinnedSocketId(candidate);
    }
  }, [layoutMode, pinnedSocketId, participants]);

  useEffect(() => {
    if (layoutMode !== "spotlight" || !pinnedSocketId) {
      return;
    }

    const target = spotlightVideoref.current;
    if (!target) {
      return;
    }

    const stream =
      pinnedSocketId === mySocketId
        ? localVideoref.current?.srcObject || window.localStream
        : pinnedVideo?.stream;

    if (stream && target.srcObject !== stream) {
      target.srcObject = stream;
    }
  }, [layoutMode, mySocketId, pinnedSocketId, pinnedVideo]);

  useEffect(() => {
    if (localVideoref.current && window.localStream && localVideoref.current.srcObject !== window.localStream) {
      localVideoref.current.srcObject = window.localStream;
    }
  }, [layoutMode]);

  const clampZoomOffset = (offset, zoom, viewport) => {
    if (!viewport.width || !viewport.height || zoom <= 1) {
      return { x: 0, y: 0 };
    }

    const maxX = ((zoom - 1) * viewport.width) / 2;
    const maxY = ((zoom - 1) * viewport.height) / 2;

    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
  };
  const inviteLink = `${window.location.origin}/meeting/${roomId}?password=${encodeURIComponent(
    meetingPassword || ""
  )}`;
  const localTileStyle =
    localTilePosition.x === null
      ? undefined
      : {
          left: `${localTilePosition.x}px`,
          top: `${localTilePosition.y}px`,
          right: "auto",
          bottom: "auto",
        };

  const applyZoomIn = () => {
    setVideoZoomLevel((prev) => Math.min(2.5, Number((prev + 0.15).toFixed(2))));
  };

  const applyZoomOut = () => {
    setVideoZoomLevel((prev) => Math.max(1, Number((prev - 0.15).toFixed(2))));
  };

  const resetZoom = () => {
    setVideoZoomLevel(1);
    setZoomOffset({ x: 0, y: 0 });
  };

  const handleZoomDragStart = (event) => {
    if (videoZoomLevel <= 1 || event.button !== 0 || !event.currentTarget) {
      return;
    }
    event.stopPropagation();
    const viewport = event.currentTarget.getBoundingClientRect();
    zoomDragViewportRef.current = { width: viewport.width, height: viewport.height };
    zoomDragLastRef.current = { x: event.clientX, y: event.clientY };
    setIsZoomDragging(true);
  };

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth <= 980;
      setIsCompactHeader(compact);
      if (!compact) {
        setHeaderMoreOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const createAndSendOffer = (peerConnection, targetSocketId) => {
    peerConnection
      .createOffer()
      .then((description) => {
        peerConnection
          .setLocalDescription(description)
          .then(() => {
            if (socketRef.current) {
              socketRef.current.emit("signal", targetSocketId, JSON.stringify({ sdp: peerConnection.localDescription }));
            }
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => console.log(e));
  };

  const addReaction = (payload) => {
    setReactions((prev) => [...prev, payload]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((item) => item.id !== payload.id));
    }, 2400);
  };

  const updateOrCreateRemoteVideo = (socketListId, stream) => {
    setVideos((prevVideos) => {
      const index = prevVideos.findIndex((videoItem) => videoItem.socketId === socketListId);
      if (index !== -1) {
        return prevVideos.map((videoItem) =>
          videoItem.socketId === socketListId ? { ...videoItem, stream } : videoItem
        );
      }

      return [...prevVideos, { socketId: socketListId, stream, autoplay: true, playsinline: true }];
    });
  };

  const attachPeerHandlers = (socketListId) => {
    if (connections[socketListId]) {
      return;
    }

    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);
    connections[socketListId].onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }));
      }
    };
    connections[socketListId].onaddstream = (event) => updateOrCreateRemoteVideo(socketListId, event.stream);
    if (window.localStream) {
      connections[socketListId].addStream(window.localStream);
    }
  };

  const updateTypingUser = ({ socketId, username: typingUsername, isTyping, threadKey }) => {
    const resolvedThreadKey = threadKey || socketId;
    if (!activeChatThreadRef.current) return;
    if (activeChatThreadRef.current && resolvedThreadKey !== activeChatThreadRef.current) {
      return;
    }
    setTypingUsers((prev) => {
      const filtered = prev.filter((item) => item.socketId !== socketId);
      if (!isTyping) return filtered;
      return [...filtered, { socketId, username: typingUsername }];
    });
  };

  const addMessage = (payload, sender, socketIdSender) => {
    const normalized = normalizeIncomingMessage(payload, sender, socketIdSender);
    const threadKey =
      normalized.type === "system"
        ? ROOM_THREAD_KEY
        : normalized.threadKey || normalized.socketId || ROOM_THREAD_KEY;

    setChatThreads((prevThreads) => {
      const existing = prevThreads[threadKey] || [];
      if (normalized?.id && existing.some((item) => item.id === normalized.id)) {
        return prevThreads;
      }
      const next = [...existing, normalized];
      const trimmed = next.length > 240 ? next.slice(-240) : next;
      return { ...prevThreads, [threadKey]: trimmed };
    });

    const selfSocketId = socketIdRef.current;
    const chatVisible = Boolean(isPanelOpenRef.current && sidePanelRef.current === "chat");
    const isActiveThread = Boolean(activeChatThreadRef.current && threadKey === activeChatThreadRef.current);

    if (normalized.type === "chat" && normalized.socketId !== selfSocketId && (!chatVisible || !isActiveThread)) {
      setNewMessages((prevCount) => prevCount + 1);
    }
  };

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(Boolean(videoPermission));
      const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(Boolean(audioPermission));
      setScreenAvailable(Boolean(navigator.mediaDevices.getDisplayMedia));

      const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      window.localStream = initialStream;
      if (localVideoref.current) {
        localVideoref.current.srcObject = initialStream;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((device) => device.kind === "audioinput");
      const cams = devices.filter((device) => device.kind === "videoinput");
      setAudioInputDevices(mics);
      setVideoInputDevices(cams);
      if (mics[0]) {
        setSelectedAudioInput(mics[0].deviceId);
      }
      if (cams[0]) {
        setSelectedVideoInput(cams[0].deviceId);
      }
    } catch (error) {
      setVideoAvailable(false);
      setAudioAvailable(false);
      console.log(error);
    }
  };

  const getUserMediaSuccess = (stream) => {
    try {
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    Object.keys(connections).forEach((id) => {
      if (id === mySocketId) return;
      connections[id].addStream(window.localStream);
      createAndSendOffer(connections[id], id);
    });

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setVideo(false);
        setAudio(false);
      };
    });
  };

  const getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      const qualityConstraints =
        videoQuality === "720p"
          ? { width: { ideal: 1280 }, height: { ideal: 720 } }
          : videoQuality === "360p"
          ? { width: { ideal: 640 }, height: { ideal: 360 } }
          : {};

      const videoConstraint =
        video && videoAvailable
          ? selectedVideoInput
            ? { ...qualityConstraints, deviceId: { exact: selectedVideoInput } }
            : { ...qualityConstraints }
          : false;
      const audioConstraint =
        audio && audioAvailable
          ? selectedAudioInput
            ? { deviceId: { exact: selectedAudioInput } }
            : true
          : false;

      navigator.mediaDevices
        .getUserMedia({ video: videoConstraint, audio: audioConstraint })
        .then(getUserMediaSuccess)
        .catch((e) => console.log(e));
      return;
    }

    try {
      const tracks = localVideoref.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }
  };

  const getDisplayMediaSuccess = (stream) => {
    try {
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    Object.keys(connections).forEach((id) => {
      if (id === mySocketId) return;
      connections[id].addStream(window.localStream);
      createAndSendOffer(connections[id], id);
    });

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setScreen(false);
        getUserMedia();
      };
    });
  };

  const getDisplayMedia = () => {
    if (screen && canShareScreen && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(getDisplayMediaSuccess).catch((e) => console.log(e));
    }
  };

  const gotMessageFromServer = (fromId, messagePayload) => {
    const signal = JSON.parse(messagePayload);
    if (fromId === mySocketId) return;
    if (!connections[fromId]) {
      attachPeerHandlers(fromId);
    }

    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => {
          if (signal.sdp.type === "offer") {
            connections[fromId]
              .createAnswer()
              .then((description) => {
                connections[fromId]
                  .setLocalDescription(description)
                  .then(() => {
                    if (socketRef.current) {
                      socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
                    }
                  })
                  .catch((e) => console.log(e));
              })
              .catch((e) => console.log(e));
          }
        })
        .catch((e) => console.log(e));
    }

    if (signal.ice) {
      connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch((e) => console.log(e));
    }
  };

  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });
    socketRef.current.on("signal", gotMessageFromServer);
    setConnectionStatus("connecting");

    socketRef.current.on("connect", () => {
      const enteredUsername = username.trim() || `Guest-${Math.floor(Math.random() * 900 + 100)}`;
      if (!username.trim()) {
        setUsername(enteredUsername);
      }
      localStorage.setItem("meeting_display_name", enteredUsername);

      socketRef.current.emit("join-call", {
        roomId,
        username: enteredUsername,
        userEmail: userData?.email || "",
        password: meetingPassword.trim(),
      });
      socketIdRef.current = socketRef.current.id;
      setMySocketIdState(socketRef.current.id);
      setWaitingStatus("joining");
      setConnectionStatus("connected");

      socketRef.current.off("chat-history");
      socketRef.current.off("chat-message");
      socketRef.current.off("system-message");
      socketRef.current.off("typing");

      socketRef.current.on("chat-history", (historyMessages) => {
        const normalized = (historyMessages || []).map((item) => normalizeIncomingMessage(item));
        const grouped = normalized.reduce((acc, item) => {
          const key = item.type === "system" ? ROOM_THREAD_KEY : item.threadKey || item.socketId || ROOM_THREAD_KEY;
          acc[key] = acc[key] || [];
          acc[key].push(item);
          return acc;
        }, {});
        Object.keys(grouped).forEach((key) => {
          const seen = new Set();
          grouped[key] = (grouped[key] || []).filter((item) => {
            const id = item?.id;
            if (!id) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });

          grouped[key].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        });
        setChatThreads(grouped);
      });

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("system-message", (payload) => addMessage(payload));
      socketRef.current.on("typing", updateTypingUser);
      socketRef.current.on("reaction", addReaction);
      socketRef.current.on("speaking", ({ socketId, isSpeaking }) => {
        if (!isSpeaking) {
          return;
        }
        setActiveSpeakerSocketId(socketId);
        if (speakingTimeoutRef.current) {
          clearTimeout(speakingTimeoutRef.current);
        }
        speakingTimeoutRef.current = setTimeout(() => {
          setActiveSpeakerSocketId("");
        }, 1600);
        if (autoSpotlight && layoutMode === "grid") {
          setPinnedSocketId(socketId);
          setLayoutMode("spotlight");
        }
      });
      socketRef.current.on("participant-list", (nextParticipants) => {
        const participantsList = nextParticipants || [];
        const validIds = new Set(participantsList.map((participant) => participant.socketId));

        setParticipants(participantsList);
        setVideos((prevVideos) => prevVideos.filter((videoItem) => validIds.has(videoItem.socketId)));

        Object.keys(connections).forEach((socketId) => {
          if (!validIds.has(socketId)) {
            try {
              connections[socketId]?.close();
            } catch (error) {
              console.log(error);
            }
            delete connections[socketId];
          }
        });

        if (pinnedSocketId && !validIds.has(pinnedSocketId)) {
          setPinnedSocketId(null);
          setLayoutMode("grid");
        }
      });
      socketRef.current.on("room-settings", (settings) => {
        setRoomLocked(Boolean(settings?.isLocked));
        setAllowChat(settings?.allowChat !== false);
        setAllowReactions(settings?.allowReactions !== false);
        setAllowScreenShare(settings?.allowScreenShare !== false);
        setVideoQuality(settings?.videoQuality || "auto");
      });
      socketRef.current.on("waiting-room-update", (queue) => {
        setWaitingQueue(queue || []);
      });
      socketRef.current.on("unmute-request-update", (queue) => {
        setUnmuteRequests(queue || []);
      });
      socketRef.current.on("waiting-room-status", (payload) => {
        const status = payload?.status || "pending";
        setWaitingStatus(status);
      });
      socketRef.current.on("force-mute", () => {
        setAudio(false);
        setAudioLockedByHost(true);
      });
      socketRef.current.on("unmute-approved", () => {
        setAudioLockedByHost(false);
        setAudio(true);
      });
      socketRef.current.on("unmute-denied", () => {
        alert("Your unmute request was denied by host/co-host.");
      });
      socketRef.current.on("force-video-off", () => {
        setVideo(false);
        setVideoLockedByHost(true);
      });
      socketRef.current.on("video-approved", () => {
        setVideoLockedByHost(false);
      });
      socketRef.current.on("removed-from-room", () => {
        alert("Host removed you from meeting");
        window.location.href = "/";
      });
      socketRef.current.on("meeting-ended", (payload) => {
        if (payload?.reason === "session_expired") {
          alert("Session expired. Meeting duration has ended.");
          window.location.href = "/home";
          return;
        }
        const by = payload?.by || "Host";
        alert(`Meeting ended by ${by}`);
        window.location.href = "/home";
      });
      socketRef.current.on("disconnect", () => setConnectionStatus("reconnecting"));
      socketRef.current.on("connect_error", () => setConnectionStatus("reconnecting"));
      socketRef.current.io.on("reconnect", () => setConnectionStatus("connected"));

      socketRef.current.on("user-left", (payload) => {
        const socketId = typeof payload === "string" ? payload : payload?.socketId;
        setVideos((prevVideos) => prevVideos.filter((videoItem) => videoItem.socketId !== socketId));
        if (connections[socketId]) {
          try {
            connections[socketId].close();
          } catch (error) {
            console.log(error);
          }
          delete connections[socketId];
        }
        setTypingUsers((prev) => prev.filter((item) => item.socketId !== socketId));
        if (pinnedSocketId === socketId) {
          setPinnedSocketId(null);
          setLayoutMode("grid");
        }
        if (payload?.participants) {
          setParticipants(payload.participants);
        }
      });

      socketRef.current.on("user-joined", (payload, legacyClients) => {
        const clients = Array.isArray(legacyClients)
          ? legacyClients
          : payload?.clientIds || payload?.participants?.map((item) => item.socketId) || [];

        if (payload?.participants) {
          setParticipants(payload.participants);
        }

        clients.forEach((socketListId) => {
          if (!socketListId || socketListId === socketRef.current.id) {
            return;
          }

          if (!connections[socketListId]) {
            attachPeerHandlers(socketListId);
          }
        });

        const joinedSocketId = typeof payload === "string" ? payload : payload?.joinedUser?.socketId;
        if (joinedSocketId === mySocketId) {
          Object.keys(connections).forEach((id) => {
            if (id === mySocketId) return;
            try {
              connections[id].addStream(window.localStream);
            } catch (e) {
              console.log(e);
            }
            createAndSendOffer(connections[id], id);
          });
        }
      });
    });
  };

  useEffect(() => {
    getPermissions();
  }, []);

  useEffect(() => {
    if (video !== undefined && audio !== undefined && !askForUsername) {
      getUserMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, audio, askForUsername]);

  useEffect(() => {
    if (!askForUsername && waitingStatus === "admitted" && video) {
      getUserMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoQuality]);

  useEffect(() => {
    if (screen !== undefined && !askForUsername) {
      getDisplayMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, askForUsername, canShareScreen]);

  useEffect(() => {
    if (!askForUsername && waitingStatus === "admitted" && socketRef.current) {
      socketRef.current.emit("participant-status-update", { isMuted: !audio, isVideoOff: !video });
    }
  }, [audio, video, askForUsername, waitingStatus]);

  useEffect(() => {
    if (videos.length === 1 && layoutMode === "grid") {
      setPinnedSocketId(videos[0].socketId);
      setLayoutMode("spotlight");
      return;
    }

    if (videos.length === 0 && layoutMode === "spotlight") {
      setPinnedSocketId(null);
      setLayoutMode("grid");
    }
  }, [videos, layoutMode]);

  useEffect(() => {
    if (gridPage >= totalGridPages) {
      setGridPage(Math.max(0, totalGridPages - 1));
    }
  }, [gridPage, totalGridPages]);

  useEffect(() => {
    if (!canShareScreen && screen) {
      setScreen(false);
    }
  }, [canShareScreen, screen]);

  useEffect(() => {
    if (!canUseReactions && showReactionTray) {
      setShowReactionTray(false);
    }
  }, [canUseReactions, showReactionTray]);

  useEffect(() => {
    if (waitingStatus !== "admitted" || !audio || !window.localStream || !socketRef.current) {
      return;
    }

    const audioTrack = window.localStream.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const interval = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
      const speakingNow = avg > 16;
      if (speakingNow !== speakingStateRef.current) {
        speakingStateRef.current = speakingNow;
        socketRef.current?.emit("speaking", speakingNow);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      source.disconnect();
      analyser.disconnect();
      ctx.close();
      speakingStateRef.current = false;
      socketRef.current?.emit("speaking", false);
    };
  }, [waitingStatus, audio]);

  useEffect(() => {
    if (waitingStatus !== "admitted") {
      return;
    }

    setMeetingElapsed(0);
    const interval = setInterval(() => {
      setMeetingElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [waitingStatus]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement?.id || "";
      setFullscreenKey(active);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const handleShortcuts = (event) => {
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "m") {
        setAudio((prev) => !prev);
      } else if (key === "v") {
        setVideo((prev) => !prev);
      } else if (key === "h") {
        toggleHandRaise();
      }
    };

    if (waitingStatus === "admitted") {
      window.addEventListener("keydown", handleShortcuts);
    }
    return () => window.removeEventListener("keydown", handleShortcuts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingStatus]);

  useEffect(() => {
    if (waitingStatus !== "admitted" || localTilePosition.x !== null) {
      return;
    }

    const defaultX = Math.max(12, window.innerWidth - 360);
    const defaultY = Math.max(120, window.innerHeight - 300);
    setLocalTilePosition({ x: defaultX, y: defaultY });
  }, [waitingStatus, localTilePosition.x]);

  useEffect(() => {
    if (!isDraggingLocalTile) {
      return;
    }

    const onMouseMove = (event) => {
      const tileWidth = localTileRef.current?.offsetWidth || 300;
      const tileHeight = localTileRef.current?.offsetHeight || 180;
      const maxX = Math.max(0, window.innerWidth - tileWidth - 8);
      const maxY = Math.max(90, window.innerHeight - tileHeight - 8);
      const nextX = Math.min(maxX, Math.max(8, event.clientX - dragOffsetRef.current.x));
      const nextY = Math.min(maxY, Math.max(90, event.clientY - dragOffsetRef.current.y));
      setLocalTilePosition({ x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      setIsDraggingLocalTile(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDraggingLocalTile]);

  useEffect(() => {
    if (!isZoomDragging) {
      return;
    }

    const onMouseMove = (event) => {
      const deltaX = event.clientX - zoomDragLastRef.current.x;
      const deltaY = event.clientY - zoomDragLastRef.current.y;
      zoomDragLastRef.current = { x: event.clientX, y: event.clientY };
      setZoomOffset((prev) =>
        clampZoomOffset(
          { x: prev.x + deltaX, y: prev.y + deltaY },
          videoZoomLevel,
          zoomDragViewportRef.current
        )
      );
    };

    const onMouseUp = () => {
      setIsZoomDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isZoomDragging, videoZoomLevel]);

  useEffect(() => {
    if (videoZoomLevel <= 1) {
      setZoomOffset({ x: 0, y: 0 });
      return;
    }
    setZoomOffset((prev) => clampZoomOffset(prev, videoZoomLevel, zoomDragViewportRef.current));
  }, [videoZoomLevel]);

  useEffect(() => {
    return () => {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      Object.values(connections).forEach((connection) => {
        if (connection && typeof connection.close === "function") {
          connection.close();
        }
      });
      connections = {};

      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleTypingEmit = () => {
    if (!socketRef.current || !canUseChat) return;
    const payload = canModerate
      ? activeChatThreadRef.current
        ? { isTyping: true, toSocketId: activeChatThreadRef.current }
        : null
      : { isTyping: true };
    if (!payload) return;

    socketRef.current.emit("typing", payload);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit(
        "typing",
        canModerate
          ? { isTyping: false, toSocketId: activeChatThreadRef.current }
          : { isTyping: false }
      );
    }, 1200);
  };

  const handleMessageChange = (event) => {
    setMessage(event.target.value);
    handleTypingEmit();
  };

  const sendMessage = () => {
    const text = message.trim();
    if (!text || !socketRef.current) return;
    if (!canUseChat) {
      alert("Host has disabled chat for participants.");
      return;
    }

    if (canModerate && !activeChatThreadRef.current) {
      alert("Select a participant to message.");
      return;
    }

    socketRef.current.emit("chat-message", {
      text,
      sender: username || "Guest",
      ...(canModerate ? { toSocketId: activeChatThreadRef.current } : {}),
    });
    socketRef.current.emit("typing", canModerate ? { isTyping: false, toSocketId: activeChatThreadRef.current } : { isTyping: false });
    setMessage("");
  };

  const connect = async () => {
    if (!meetingPassword.trim()) {
      alert("Please enter meeting password");
      return;
    }

    try {
      await validateMeetingAccess(roomId, meetingPassword.trim());
      setAskForUsername(false);
      setVideo(videoAvailable);
      setAudio(audioAvailable);
      connectToSocketServer();
    } catch (error) {
      const status = error?.response?.data?.status;
      if (status === "not_started") {
        setWaitingStatus("not_started");
        setAskForUsername(false);
        return;
      }
      if (status === "expired") {
        setWaitingStatus("session_expired");
        setAskForUsername(false);
        return;
      }
      alert(error?.response?.data?.message || "Unable to join meeting");
    }
  };

  const togglePanel = (panelName) => {
    if (isPanelOpen && sidePanel === panelName) {
      setIsPanelOpen(false);
      return;
    }
    setSidePanel(panelName);
    setIsPanelOpen(true);
    if (panelName === "chat") setNewMessages(0);
  };

  const copyMeetingCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      console.log(error);
    }
  };

  const copyInviteDetails = async () => {
    try {
      await navigator.clipboard.writeText(
        `Meeting ID: ${roomId}\nPassword: ${meetingPassword}\nJoin Link: ${inviteLink}`
      );
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1500);
    } catch (error) {
      console.log(error);
    }
  };

  const handleToggleAudio = () => {
    if (!audio && !canModerate && audioLockedByHost) {
      alert("Host has muted you. Use 'Ask to unmute' to request permission.");
      return;
    }
    setAudio((prev) => !prev);
  };

  const handleToggleVideo = () => {
    if (!video && !canModerate && videoLockedByHost) {
      alert("Host has disabled your camera. Please wait for permission.");
      return;
    }
    setVideo((prev) => !prev);
  };

  const toggleHandRaise = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    socketRef.current?.emit("toggle-hand", next);
  };

  const sendReaction = (emoji) => {
    if (!canUseReactions) {
      setShowReactionTray(false);
      alert("Host has disabled reactions for participants.");
      return;
    }
    socketRef.current?.emit("reaction", emoji);
    setShowReactionTray(false);
  };

  const toggleLayoutMode = () => {
    if (layoutMode === "grid") {
      setLayoutMode("spotlight");
      if (!pinnedSocketId && videos.length > 0) {
        setPinnedSocketId(videos[0].socketId);
      }
      return;
    }
    setLayoutMode("grid");
    setPinnedSocketId(null);
  };

  const handleEndCall = () => {
    try {
      if (localVideoref.current?.srcObject) {
        const tracks = localVideoref.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    } catch (e) {
      console.log(e);
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    window.location.href = "/";
  };

  const handleEndMeetingForAll = () => {
    if (!isHost) return;
    const shouldEnd = window.confirm("End meeting for everyone?");
    if (!shouldEnd) return;
    socketRef.current?.emit("end-meeting-for-all");
  };

  const applySelectedDevices = () => {
    getUserMedia();
    setSettingsOpen(false);
  };

  const handleLocalTileDragStart = (event) => {
    if (!localTileRef.current) return;
    if (event.button !== 0) return;

    const rect = localTileRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDraggingLocalTile(true);
  };

  const toggleFullscreenById = async (elementId) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      if (document.fullscreenElement?.id === elementId) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch (error) {
      console.log(error);
    }
  };

  const toggleRoomLock = () => {
    if (!isHost) return;
    socketRef.current?.emit("toggle-lock-room", !roomLocked);
  };

  const toggleRoomPermission = (key, value) => {
    if (!isHost) return;
    socketRef.current?.emit("toggle-room-permission", { key, value });
  };

  const setRoomVideoQuality = (nextQuality) => {
    if (!isHost) return;
    socketRef.current?.emit("set-video-quality", nextQuality);
  };

  const muteAllParticipants = () => {
    if (!canModerate) return;
    socketRef.current?.emit("mute-all");
  };

  const muteParticipant = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("mute-participant", targetSocketId);
  };

  const stopAllParticipantVideos = () => {
    if (!canModerate) return;
    socketRef.current?.emit("video-off-all");
  };

  const stopParticipantVideo = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("video-off-participant", targetSocketId);
  };

  const allowParticipantVideo = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("video-allow-participant", targetSocketId);
  };

  const removeParticipant = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("remove-participant", targetSocketId);
  };

  const admitParticipant = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("admit-from-waiting-room", targetSocketId);
  };

  const rejectParticipant = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("reject-from-waiting-room", targetSocketId);
  };

  const requestUnmute = () => {
    if (!socketRef.current || canModerate) return;
    socketRef.current.emit("request-unmute");
  };

  const approveUnmute = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("approve-unmute", targetSocketId);
  };

  const denyUnmute = (targetSocketId) => {
    if (!canModerate || !targetSocketId) return;
    socketRef.current?.emit("deny-unmute", targetSocketId);
  };

  const promoteToCoHost = (targetSocketId) => {
    if (!isHost || !targetSocketId) return;
    socketRef.current?.emit("promote-cohost", targetSocketId);
  };

  const demoteToParticipant = (targetSocketId) => {
    if (!isHost || !targetSocketId) return;
    socketRef.current?.emit("demote-cohost", targetSocketId);
  };

  const displayedChatMessages = useMemo(() => {
    const roomMessages = chatThreads[ROOM_THREAD_KEY] || [];
    const threadMessages = activeChatThread ? chatThreads[activeChatThread] || [] : [];
    const merged = [...roomMessages, ...threadMessages];
    const seen = new Set();
    const unique = [];

    merged.forEach((item) => {
      if (!item) return;
      const id = item.id;
      if (id) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      unique.push(item);
    });

    unique.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    return unique;
  }, [chatThreads, activeChatThread]);

  const chatParticipants = useMemo(
    () =>
      participants.filter(
        (participant) => participant.socketId !== mySocketId && !["host", "cohost"].includes(participant.role)
      ),
    [participants, mySocketId]
  );

  const typingLabel = !canUseChat
    ? "Host has disabled chat for participants."
    : canModerate && !activeChatThread
    ? "Select a participant to start chatting."
    : typingUsers.length > 0
    ? `${typingUsers.map((item) => item.username).slice(0, 2).join(", ")} typing...`
    : "";

  const isDesktopLayout = !isCompactHeader;
  const showSidebar = isDesktopLayout || isPanelOpen;
  const showSpotlightBottomStrip = layoutMode === "spotlight" && (!isDesktopLayout || isPanelOpen);

  const renderLocalSpotlightTile = () => (
    <div
      className={`${styles.remoteTile} ${pinnedSocketId === mySocketId ? styles.pinnedTile : ""}`}
      onClick={() => {
        if (!mySocketId) return;
        setLayoutMode("spotlight");
        setPinnedSocketId(mySocketId);
      }}
    >
      <button
        type="button"
        className={styles.fullscreenBtn}
        onClick={(event) => {
          event.stopPropagation();
          toggleFullscreenById("local-video-wrapper");
        }}
      >
        {fullscreenKey === "local-video-wrapper" ? <FullscreenExitIcon /> : <FullscreenIcon />}
      </button>
      <video id="local-video-wrapper" ref={localVideoref} autoPlay muted playsInline></video>
      <p className={styles.videoNameLabel}>
        You ({username || "Guest"}) {isHandRaised ? "[Hand Raised]" : ""}
      </p>
      <div className={styles.participantStatePill}>
        {audio ? <MicIcon fontSize="small" /> : <MicOffIcon fontSize="small" />}
        {video ? <VideocamIcon fontSize="small" /> : <VideocamOffIcon fontSize="small" />}
      </div>
    </div>
  );

  const renderVideoTiles = (videoItems = []) =>
    videoItems.map((videoItem) => {
      const participant = participantMap[videoItem.socketId];
      return (
        <div
          key={videoItem.socketId}
          className={`${styles.remoteTile} ${layoutMode === "spotlight" && pinnedSocketId === videoItem.socketId ? styles.pinnedTile : ""} ${
            activeSpeakerSocketId === videoItem.socketId ? styles.activeSpeakerTile : ""
          } ${layoutMode === "grid" && pagedDisplayedVideos.length === 1 && videoZoomLevel > 1 ? styles.zoomableViewport : ""} ${
            layoutMode === "grid" && pagedDisplayedVideos.length === 1 && isZoomDragging ? styles.zoomDragging : ""
          }`}
          onClick={() => {
            setLayoutMode("spotlight");
            setPinnedSocketId(videoItem.socketId);
          }}
          onMouseDown={
            layoutMode === "grid" && pagedDisplayedVideos.length === 1 ? handleZoomDragStart : undefined
          }
          onDoubleClick={layoutMode === "grid" && pagedDisplayedVideos.length === 1 ? resetZoom : undefined}
        >
          <button
            type="button"
            className={styles.fullscreenBtn}
            onClick={(event) => {
              event.stopPropagation();
              toggleFullscreenById(`remote-video-${videoItem.socketId}`);
            }}
          >
            {fullscreenKey === `remote-video-${videoItem.socketId}` ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
          <video
            id={`remote-video-${videoItem.socketId}`}
            data-socket={videoItem.socketId}
            ref={(ref) => {
              if (ref && videoItem.stream) {
                ref.srcObject = videoItem.stream;
              }
            }}
            autoPlay
            playsInline
            style={singleGridZoomStyle}
          ></video>
          <p className={styles.videoNameLabel}>
            {participant?.username || "Participant"}
            {participant?.role === "host" ? " (Host)" : ""}
            {participant?.role === "cohost" ? " (Co-host)" : ""}
            {participant?.handRaised ? " [Hand Raised]" : ""}
          </p>
          <div className={styles.participantStatePill}>
            {participant?.isMuted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
            {participant?.isVideoOff ? <VideocamOffIcon fontSize="small" /> : <VideocamIcon fontSize="small" />}
          </div>
        </div>
      );
    });

  return (
    <div className={styles.meetShell}>
      {askForUsername ? (
        <div className={styles.lobbyContainer}>
          <div className={styles.lobbyCard}>
            <p className={styles.lobbyOverline}>Secure Room</p>
            <h2>Join Meeting</h2>
            <p className={styles.roomInfo}>
              Room ID: <strong>{roomId}</strong>
            </p>

            <TextField id="username" label="Your Name" value={username} onChange={(event) => setUsername(event.target.value)} variant="outlined" fullWidth />
            <TextField
              id="meeting-password"
              label="Meeting Password"
              value={meetingPassword}
              onChange={(event) => setMeetingPassword(event.target.value)}
              variant="outlined"
              fullWidth
              style={{ marginTop: "12px" }}
            />

            <Button variant="contained" onClick={connect} className={styles.connectBtn}>
              Join Now
            </Button>

            <div className={styles.previewWrap}>
              <video ref={localVideoref} autoPlay muted playsInline className={styles.previewVideo}></video>
            </div>
          </div>
        </div>
      ) : waitingStatus === "pending" || waitingStatus === "joining" ? (
        <div className={styles.lobbyContainer}>
          <div className={styles.lobbyCard}>
            <p className={styles.lobbyOverline}>Waiting Room</p>
            <h2>Please wait for host</h2>
            <p className={styles.roomInfo}>You will be admitted soon to room <strong>{roomId}</strong>.</p>
            <Button variant="outlined" onClick={handleEndCall}>Leave</Button>
          </div>
        </div>
      ) : waitingStatus === "rejected" ||
        waitingStatus === "meeting_not_found" ||
        waitingStatus === "join_failed" ||
        waitingStatus === "invalid_password" ||
        waitingStatus === "not_started" ||
        waitingStatus === "session_expired" ? (
        <div className={styles.lobbyContainer}>
          <div className={styles.lobbyCard}>
            <p className={styles.lobbyOverline}>Access Denied</p>
            <h2>
              {waitingStatus === "rejected"
                ? "Host rejected your request"
                : waitingStatus === "invalid_password"
                ? "Invalid meeting password"
                : waitingStatus === "not_started"
                ? "Meeting has not started yet"
                : waitingStatus === "session_expired"
                ? "Session expired"
                : "Unable to join this meeting"}
            </h2>
            <p className={styles.roomInfo}>
              {waitingStatus === "session_expired"
                ? "This meeting has ended as per scheduled duration."
                : "Try again with valid meeting id and password."}
            </p>
            <Button variant="contained" onClick={handleEndCall}>Go Back</Button>
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          <header className={styles.meetingHeader}>
            <div>
              <p className={styles.headerRoomLabel}>Meeting</p>
              <h3>{roomId}</h3>
              <p className={styles.meetingMeta}>
                Duration {formatDuration(meetingElapsed)} | Status{" "}
                <span className={styles.connectionStatus}>{connectionStatus}</span>
                {videoZoomLevel > 1 ? (
                  <>
                    {" "}
                    | View {Math.round(videoZoomLevel * 100)}%{" "}
                    <button type="button" className={styles.metaResetLink} onClick={resetZoom}>
                      Reset
                    </button>
                  </>
                ) : null}
              </p>
              <div className={styles.policyPills}>
                <span className={`${styles.policyPill} ${allowChat ? styles.policyPillEnabled : styles.policyPillDisabled}`}>
                  Chat {allowChat ? "On" : "Off"}
                </span>
                <span className={`${styles.policyPill} ${allowReactions ? styles.policyPillEnabled : styles.policyPillDisabled}`}>
                  Reactions {allowReactions ? "On" : "Off"}
                </span>
                <span className={`${styles.policyPill} ${allowScreenShare ? styles.policyPillEnabled : styles.policyPillDisabled}`}>
                  Share {allowScreenShare ? "On" : "Off"}
                </span>
              </div>
            </div>

            <div className={styles.headerActions}>
              <Tooltip title={layoutMode === "grid" ? "Spotlight layout" : "Grid layout"}>
                <IconButton onClick={toggleLayoutMode} className={styles.headerIconBtn}>
                  {layoutMode === "grid" ? <ViewAgendaIcon /> : <GridViewIcon />}
                </IconButton>
              </Tooltip>

              <Badge badgeContent={participants.length} color="primary">
                <IconButton onClick={() => togglePanel("people")} className={styles.headerIconBtn}>
                  <PeopleAltIcon />
                </IconButton>
              </Badge>

              <Badge badgeContent={newMessages} color="error" max={99}>
                <IconButton onClick={() => togglePanel("chat")} className={styles.headerIconBtn}>
                  <ChatIcon />
                </IconButton>
              </Badge>

              {!isCompactHeader ? (
                <>
                  <Tooltip title="Scale down">
                    <span>
                      <IconButton onClick={applyZoomOut} className={styles.headerIconBtn} disabled={videoZoomLevel <= 1}>
                        <ZoomOutIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Reset view">
                    <IconButton onClick={resetZoom} className={styles.headerIconBtn}>
                      <CenterFocusStrongIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Scale up">
                    <span>
                      <IconButton onClick={applyZoomIn} className={styles.headerIconBtn} disabled={videoZoomLevel >= 2.5}>
                        <ZoomInIcon />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title={copied ? "Copied" : "Copy room code"}>
                    <IconButton onClick={copyMeetingCode} className={styles.headerIconBtn}>
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={inviteCopied ? "Invite copied" : "Copy invite details"}>
                    <IconButton onClick={copyInviteDetails} className={styles.headerIconBtn}>
                      <LinkIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Device Settings">
                    <IconButton onClick={() => setSettingsOpen((prev) => !prev)} className={styles.headerIconBtn}>
                      <SettingsIcon />
                    </IconButton>
                  </Tooltip>

                  {isHost ? (
                    <Tooltip title={roomLocked ? "Unlock meeting" : "Lock meeting"}>
                      <IconButton onClick={toggleRoomLock} className={styles.headerIconBtn}>
                        {roomLocked ? <LockIcon /> : <LockOpenIcon />}
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </>
              ) : (
                <div className={styles.headerMoreWrap}>
                  <Tooltip title="More controls">
                    <IconButton onClick={() => setHeaderMoreOpen((prev) => !prev)} className={styles.headerIconBtn}>
                      <MoreHorizIcon />
                    </IconButton>
                  </Tooltip>

                  {headerMoreOpen ? (
                    <div className={styles.headerMoreMenu}>
                      <button type="button" onClick={() => { copyMeetingCode(); setHeaderMoreOpen(false); }}>
                        <ContentCopyIcon fontSize="small" />
                        Copy room code
                      </button>
                      <button type="button" onClick={() => { copyInviteDetails(); setHeaderMoreOpen(false); }}>
                        <LinkIcon fontSize="small" />
                        Copy invite
                      </button>
                      <button type="button" onClick={() => { setSettingsOpen((prev) => !prev); setHeaderMoreOpen(false); }}>
                        <SettingsIcon fontSize="small" />
                        Device settings
                      </button>
                      <button type="button" onClick={() => { applyZoomOut(); setHeaderMoreOpen(false); }} disabled={videoZoomLevel <= 1}>
                        <ZoomOutIcon fontSize="small" />
                        Scale down
                      </button>
                      <button type="button" onClick={() => { resetZoom(); setHeaderMoreOpen(false); }}>
                        <CenterFocusStrongIcon fontSize="small" />
                        Reset view
                      </button>
                      <button type="button" onClick={() => { applyZoomIn(); setHeaderMoreOpen(false); }} disabled={videoZoomLevel >= 2.5}>
                        <ZoomInIcon fontSize="small" />
                        Scale up
                      </button>
                      {isHost ? (
                        <button type="button" onClick={() => { toggleRoomLock(); setHeaderMoreOpen(false); }}>
                          {roomLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                          {roomLocked ? "Unlock meeting" : "Lock meeting"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </header>

          {reactions.length > 0 ? (
            <div className={styles.reactionOverlay}>
              {reactions.map((reaction) => (
                <div key={reaction.id} className={styles.reactionBubble}>
                  <span>{reaction.emoji}</span>
                  <p>{reaction.username}</p>
                </div>
              ))}
            </div>
          ) : null}

          {connectionStatus === "reconnecting" ? (
            <div className={styles.reconnectOverlay}>Reconnecting...</div>
          ) : null}

          <div className={`${styles.meetBody} ${styles.meetBodyWithPanel}`}>
            <div className={styles.videoStage}>
            {layoutMode === "spotlight" && pinnedSocketId ? (
                <div
                  className={`${styles.spotlightArea} ${videoZoomLevel > 1 ? styles.zoomableViewport : ""} ${isZoomDragging ? styles.zoomDragging : ""}`}
                  onMouseDown={handleZoomDragStart}
                  onDoubleClick={resetZoom}
                >
                <button
                  type="button"
                  className={styles.fullscreenBtn}
                  onClick={() => toggleFullscreenById("spotlight-video-wrapper")}
                >
                  {fullscreenKey === "spotlight-video-wrapper" ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </button>
                <video
                  id="spotlight-video-wrapper"
                  ref={spotlightVideoref}
                  autoPlay
                  playsInline
                  className={styles.spotlightVideo}
                  style={{ ...(spotlightZoomStyle || {}), objectFit: videoZoomLevel > 1 ? "cover" : "contain" }}
                ></video>
                <p className={styles.videoNameLabel}>
                  {pinnedSocketId === mySocketId
                    ? `You (${username || "Guest"})`
                    : participantMap[pinnedSocketId]?.username || "Participant"}
                  {participantMap[pinnedSocketId]?.role === "host" ? " (Host)" : ""}
                  {participantMap[pinnedSocketId]?.role === "cohost" ? " (Co-host)" : ""}
                </p>
              </div>
            ) : null}

            {layoutMode === "grid" || showSpotlightBottomStrip ? (
              <div className={`${styles.conferenceView} ${layoutMode === "spotlight" ? styles.conferenceViewFilmstrip : ""}`}>
                {layoutMode === "spotlight" ? renderLocalSpotlightTile() : null}
                {renderVideoTiles(visibleVideoItems)}
              </div>
            ) : null}

            {layoutMode === "grid" && totalGridPages > 1 ? (
              <div className={styles.gridPager}>
                <IconButton
                  size="small"
                  onClick={() => setGridPage((prev) => Math.max(0, prev - 1))}
                  disabled={gridPage === 0}
                >
                  <NavigateBeforeIcon />
                </IconButton>
                <span>
                  {gridPage + 1}/{totalGridPages}
                </span>
                <IconButton
                  size="small"
                  onClick={() => setGridPage((prev) => Math.min(totalGridPages - 1, prev + 1))}
                  disabled={gridPage >= totalGridPages - 1}
                >
                  <NavigateNextIcon />
                </IconButton>
              </div>
            ) : null}

            {layoutMode === "grid" ? (
              <div
                className={`${styles.localVideoWrap} ${
                  isDraggingLocalTile ? styles.localVideoWrapDragging : ""
                }`}
                ref={localTileRef}
                style={localTileStyle}
                onMouseDown={handleLocalTileDragStart}
              >
                <button
                  type="button"
                  className={styles.fullscreenBtn}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFullscreenById("local-video-wrapper");
                  }}
                >
                  {fullscreenKey === "local-video-wrapper" ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </button>
                <video
                  id="local-video-wrapper"
                  className={styles.meetUserVideo}
                  ref={localVideoref}
                  autoPlay
                  muted
                  playsInline
                ></video>
                <p className={styles.videoNameLabel}>
                  You ({username || "Guest"}) {isHandRaised ? "[Hand Raised]" : ""}
                </p>
              </div>
            ) : null}
          </div>

          {showSidebar ? (
            <aside className={styles.sidePanel}>
              {isPanelOpen ? (
                <>
                  <div className={styles.sidePanelHeader}>
                    <h4>{sidePanel === "chat" ? "Direct Chat" : "Participants"}</h4>
                    <IconButton onClick={() => setIsPanelOpen(false)}>
                      <CloseIcon />
                    </IconButton>
                  </div>

                  {sidePanel === "chat" ? (
                <>
                  {canModerate ? (
                    <div className={styles.chatThreadPicker}>
                      <span>Conversation</span>
                      <select
                        value={activeChatThread}
                        onChange={(event) => setActiveChatThread(event.target.value)}
                      >
                        <option value="">Select participant</option>
                        {chatParticipants.map((participant) => (
                          <option key={participant.socketId} value={participant.socketId}>
                            {participant.username}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className={styles.chattingDisplay}>
                    {displayedChatMessages.length === 0 ? (
                      <p className={styles.emptyText}>No messages yet.</p>
                    ) : (
                      displayedChatMessages.map((item) => {
                        const isSelf = item.socketId && item.socketId === mySocketId;
                        return (
                          <div
                            key={item.id}
                            className={`${styles.messageBubble} ${
                              item.type === "system"
                                ? styles.systemMessage
                                : isSelf
                                ? styles.myMessage
                                : styles.theirMessage
                            }`}
                          >
                            {item.type !== "system" ? <p className={styles.sender}>{item.sender}</p> : null}
                            <p>{item.text}</p>
                            <span>{formatTime(item.createdAt)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <p className={styles.typingIndicator}>{typingLabel}</p>

                  <div className={styles.chattingArea}>
                    <TextField
                      value={message}
                      onChange={handleMessageChange}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") sendMessage();
                      }}
                      id="chat-input"
                      label={
                        canUseChat
                          ? canModerate && !activeChatThread
                            ? "Select participant to message"
                            : "Message"
                          : "Chat disabled by host"
                      }
                      variant="outlined"
                      size="small"
                      disabled={!canUseChat || (canModerate && !activeChatThread)}
                    />
                    <IconButton
                      className={styles.sendBtn}
                      onClick={sendMessage}
                      disabled={!canUseChat || (canModerate && !activeChatThread)}
                    >
                      <SendIcon />
                    </IconButton>
                  </div>
                </>
              ) : (
                <div className={styles.participantList}>
                  {canModerate ? (
                    <div className={styles.hostActions}>
                      <Button size="small" variant="contained" onClick={muteAllParticipants}>
                        Mute All
                      </Button>
                      <Button size="small" variant="outlined" onClick={stopAllParticipantVideos}>
                        Stop Videos
                      </Button>
                      <Button size="small" variant="outlined" onClick={toggleRoomLock} disabled={!isHost}>
                        {roomLocked ? "Unlock" : "Lock"} Meeting
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => toggleRoomPermission("allowChat", !allowChat)}
                        disabled={!isHost}
                      >
                        Chat {allowChat ? "Off" : "On"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => toggleRoomPermission("allowReactions", !allowReactions)}
                        disabled={!isHost}
                      >
                        Reactions {allowReactions ? "Off" : "On"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => toggleRoomPermission("allowScreenShare", !allowScreenShare)}
                        disabled={!isHost}
                      >
                        Share {allowScreenShare ? "Off" : "On"}
                      </Button>
                      <label className={styles.qualityControl}>
                        Quality
                        <select
                          value={videoQuality}
                          onChange={(event) => setRoomVideoQuality(event.target.value)}
                          disabled={!isHost}
                        >
                          {VIDEO_QUALITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {canModerate && waitingQueue.length > 0 ? (
                    <div className={styles.waitingBox}>
                      <p className={styles.waitingTitle}>Waiting Room ({waitingQueue.length})</p>
                      {waitingQueue.map((request) => (
                        <div key={request.socketId} className={styles.waitingItem}>
                          <span>{request.username}</span>
                          <div className={styles.waitingActions}>
                            <Button size="small" onClick={() => admitParticipant(request.socketId)}>
                              Admit
                            </Button>
                            <Button size="small" color="error" onClick={() => rejectParticipant(request.socketId)}>
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {canModerate && unmuteRequests.length > 0 ? (
                    <div className={styles.waitingBox}>
                      <p className={styles.waitingTitle}>Unmute Requests ({unmuteRequests.length})</p>
                      {unmuteRequests.map((request) => (
                        <div key={request.socketId} className={styles.waitingItem}>
                          <span>{request.username}</span>
                          <div className={styles.waitingActions}>
                            <Button size="small" onClick={() => approveUnmute(request.socketId)}>
                              Allow
                            </Button>
                            <Button size="small" color="error" onClick={() => denyUnmute(request.socketId)}>
                              Deny
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {participants.length === 0 ? (
                    <p className={styles.emptyText}>No participants yet.</p>
                  ) : (
                    participants.map((participant) => (
                      <div key={participant.socketId} className={styles.participantItem}>
                        <span className={styles.participantDot}></span>
                        <p>
                          {participant.username}
                          {participant.socketId === mySocketId ? " (You)" : ""}
                          {participant.role === "host" ? " - Host" : ""}
                          {participant.role === "cohost" ? " - Co-host" : ""}
                          {participant.handRaised ? (
                            <span className={styles.handBadge}>
                              <PanToolAltIcon fontSize="inherit" /> Hand raised
                            </span>
                          ) : null}
                        </p>
                        <div className={styles.participantInlineState}>
                          {participant.isMuted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
                          {participant.isVideoOff ? (
                            <VideocamOffIcon fontSize="small" />
                          ) : (
                            <VideocamIcon fontSize="small" />
                          )}
                          {canModerate && participant.socketId !== mySocketId && participant.role !== "host" ? (
                            <Tooltip title={participant.audioLocked ? "Allow unmute" : "Mute + lock mic"}>
                              <IconButton
                                size="small"
                                className={styles.moderationBtn}
                                onClick={() =>
                                  participant.audioLocked
                                    ? approveUnmute(participant.socketId)
                                    : muteParticipant(participant.socketId)
                                }
                              >
                                {participant.audioLocked ? (
                                  <MicIcon fontSize="small" />
                                ) : (
                                  <MicOffIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          ) : null}
                          {canModerate && participant.socketId !== mySocketId && participant.role !== "host" ? (
                            <Tooltip title={participant.videoLocked ? "Allow camera" : "Stop camera + lock"}>
                              <IconButton
                                size="small"
                                className={styles.moderationBtn}
                                onClick={() =>
                                  participant.videoLocked
                                    ? allowParticipantVideo(participant.socketId)
                                    : stopParticipantVideo(participant.socketId)
                                }
                              >
                                {participant.videoLocked ? (
                                  <VideocamIcon fontSize="small" />
                                ) : (
                                  <VideocamOffIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          ) : null}
                          {isHost && participant.socketId !== mySocketId && participant.role !== "host" ? (
                            participant.role === "cohost" ? (
                              <Button size="small" onClick={() => demoteToParticipant(participant.socketId)}>
                                Demote
                              </Button>
                            ) : (
                              <Button size="small" onClick={() => promoteToCoHost(participant.socketId)}>
                                Co-host
                              </Button>
                            )
                          ) : null}
                          {canModerate && participant.socketId !== mySocketId && participant.role !== "host" ? (
                            <IconButton
                              size="small"
                              className={styles.removeBtn}
                              onClick={() => removeParticipant(participant.socketId)}
                            >
                              <PersonRemoveIcon fontSize="small" />
                            </IconButton>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
                  )}
                </>
              ) : (
                <>
                  <div className={styles.sidePanelHeader}>
                    <h4>Participants</h4>
                  </div>

                  {layoutMode === "spotlight" ? (
                    <div className={styles.sidebarVideoStrip}>
                      {renderLocalSpotlightTile()}
                      {renderVideoTiles(visibleVideoItems)}
                    </div>
                  ) : (
                    <div className={styles.participantList}>
                      {participants.length === 0 ? (
                        <p className={styles.emptyText}>No participants yet.</p>
                      ) : (
                        participants.map((participant) => (
                          <div key={participant.socketId} className={styles.participantItem}>
                            <span className={styles.participantDot}></span>
                            <p>
                              {participant.username}
                              {participant.socketId === mySocketId ? " (You)" : ""}
                              {participant.role === "host" ? " - Host" : ""}
                              {participant.role === "cohost" ? " - Co-host" : ""}
                              {participant.handRaised ? (
                                <span className={styles.handBadge}>
                                  <PanToolAltIcon fontSize="inherit" /> Hand raised
                                </span>
                              ) : null}
                            </p>
                            <div className={styles.participantInlineState}>
                              {participant.isMuted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
                              {participant.isVideoOff ? (
                                <VideocamOffIcon fontSize="small" />
                              ) : (
                                <VideocamIcon fontSize="small" />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </aside>
          ) : null}
        </div>

          {settingsOpen ? (
            <div className={styles.settingsPanel}>
              <h4>Device Settings</h4>
              <label>
                Microphone
                <select
                  value={selectedAudioInput}
                  onChange={(event) => setSelectedAudioInput(event.target.value)}
                >
                  {audioInputDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || "Microphone"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Camera
                <select
                  value={selectedVideoInput}
                  onChange={(event) => setSelectedVideoInput(event.target.value)}
                >
                  {videoInputDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || "Camera"}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={autoSpotlight}
                  onChange={(event) => setAutoSpotlight(event.target.checked)}
                />
                Auto spotlight active speaker
              </label>
              <div className={styles.settingsActions}>
                <Button size="small" onClick={() => setSettingsOpen(false)}>Close</Button>
                <Button size="small" variant="contained" onClick={applySelectedDevices}>Apply</Button>
              </div>
            </div>
          ) : null}

          <div className={styles.buttonContainers}>
            <IconButton
              onClick={handleToggleVideo}
              className={styles.controlBtn}
              disabled={!video && !canModerate && videoLockedByHost}
            >
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton
              onClick={handleToggleAudio}
              className={styles.controlBtn}
              disabled={!audio && !canModerate && audioLockedByHost}
            >
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {!audio && !canModerate && audioLockedByHost ? (
              <Button size="small" variant="outlined" onClick={requestUnmute} className={styles.requestUnmuteBtn}>
                Ask to unmute
              </Button>
            ) : null}
            {screenAvailable ? (
              <IconButton
                onClick={() => {
                  if (!canShareScreen) {
                    alert("Host has disabled screen sharing for participants.");
                    return;
                  }
                  setScreen((prev) => !prev);
                }}
                className={styles.controlBtn}
                disabled={!canShareScreen}
              >
                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            ) : null}
            <IconButton onClick={toggleHandRaise} className={`${styles.controlBtn} ${isHandRaised ? styles.activeControl : ""}`}>
              <PanToolAltIcon />
            </IconButton>
            <div className={styles.reactionWrap}>
              <IconButton
                onClick={() => setShowReactionTray((prev) => !prev)}
                className={styles.controlBtn}
                disabled={!canUseReactions}
              >
                <EmojiEmotionsIcon />
              </IconButton>
              {showReactionTray && canUseReactions ? (
                <div className={styles.reactionTray}>
                  {QUICK_REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => sendReaction(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <IconButton onClick={handleEndCall} className={`${styles.controlBtn} ${styles.endBtn}`}>
              <CallEndIcon />
            </IconButton>
            {isHost ? (
              <Tooltip title="End Meeting For All">
                <IconButton onClick={handleEndMeetingForAll} className={`${styles.controlBtn} ${styles.endForAllBtn}`}>
                  <StopCircleIcon />
                </IconButton>
              </Tooltip>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(VideoMeetComponent);


