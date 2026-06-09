import { Server } from "socket.io";
import bcrypt from "bcrypt";
import supabase from "../db/supabase.js";
import { ensureAdminPolicy } from "../db/adminPolicy.js";

let connections = {};
let messages = {};
let directMessages = {};
let timeOnline = {};
let socketToRoom = {};
let participantState = {};
let roomSettings = {};
let waitingRooms = {};
let roomExpiryTimers = {};
const ALLOWED_REACTIONS = ["👍", "👏", "🔥", "❤️", "😂", "🎉"];

const MAX_MESSAGES_PER_ROOM = 300;
const MAX_DIRECT_MESSAGES_PER_THREAD = 200;

const getRoomFromSocket = (socketId) => socketToRoom[socketId] || null;

const ensureRoom = (roomId) => {
  if (!connections[roomId]) {
    connections[roomId] = [];
  }
  if (!messages[roomId]) {
    messages[roomId] = [];
  }
  if (!directMessages[roomId]) {
    directMessages[roomId] = {};
  }
  if (!roomSettings[roomId]) {
    roomSettings[roomId] = {
      isLocked: false,
      allowChat: true,
      allowReactions: true,
      allowScreenShare: true,
      videoQuality: "auto",
      unmuteRequests: [],
    };
  }
  if (!waitingRooms[roomId]) {
    waitingRooms[roomId] = [];
  }
};

const ensureDirectThread = (roomId, threadKey) => {
  ensureRoom(roomId);
  if (!directMessages[roomId][threadKey]) {
    directMessages[roomId][threadKey] = [];
  }
};

const pushDirectMessage = (roomId, threadKey, payload) => {
  ensureDirectThread(roomId, threadKey);
  directMessages[roomId][threadKey].push(payload);
  if (directMessages[roomId][threadKey].length > MAX_DIRECT_MESSAGES_PER_THREAD) {
    directMessages[roomId][threadKey] = directMessages[roomId][threadKey].slice(-MAX_DIRECT_MESSAGES_PER_THREAD);
  }
};

const getParticipants = (roomId) =>
  (connections[roomId] || []).map((id) => ({
    socketId: id,
    username: participantState[id]?.username || `Guest-${id.slice(0, 5)}`,
    isMuted: Boolean(participantState[id]?.isMuted),
    isVideoOff: Boolean(participantState[id]?.isVideoOff),
    audioLocked: Boolean(participantState[id]?.audioLocked),
    videoLocked: Boolean(participantState[id]?.videoLocked),
    handRaised: Boolean(participantState[id]?.handRaised),
    role: participantState[id]?.role || "guest",
  }));

const getHostsInRoom = (roomId) =>
  (connections[roomId] || []).filter((socketId) => participantState[socketId]?.role === "host");

const getModeratorsInRoom = (roomId) =>
  (connections[roomId] || []).filter((socketId) =>
    ["host", "cohost"].includes(participantState[socketId]?.role)
  );

const isHost = (socketId, roomId) => getHostsInRoom(roomId).includes(socketId);
const isModerator = (socketId, roomId) => getModeratorsInRoom(roomId).includes(socketId);
const canBypassPolicy = (socketId, roomId) => isModerator(socketId, roomId);

const pushMessage = (roomId, payload) => {
  ensureRoom(roomId);
  messages[roomId].push(payload);
  if (messages[roomId].length > MAX_MESSAGES_PER_ROOM) {
    messages[roomId] = messages[roomId].slice(-MAX_MESSAGES_PER_ROOM);
  }
};

const emitParticipants = (io, roomId) => {
  io.to(roomId).emit("participant-list", getParticipants(roomId));
};

const emitRoomSettings = (io, roomId) => {
  io.to(roomId).emit("room-settings", roomSettings[roomId]);
};

const emitWaitingRoomStateToHosts = (io, roomId) => {
  const moderators = getModeratorsInRoom(roomId);
  moderators.forEach((moderatorId) => {
    io.to(moderatorId).emit("waiting-room-update", waitingRooms[roomId] || []);
  });
};

const emitUnmuteRequestsToModerators = (io, roomId) => {
  const moderators = getModeratorsInRoom(roomId);
  const requests = roomSettings[roomId]?.unmuteRequests || [];
  moderators.forEach((moderatorId) => {
    io.to(moderatorId).emit("unmute-request-update", requests);
  });
};

const createSystemMessage = (text) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: "system",
  text,
  createdAt: new Date().toISOString(),
});

const selectMeetingRoomColumns =
  "id,meeting_id,password_hash,host_email,scheduled_start_at,scheduled_end_at,is_active";

const mapMeetingRoomRow = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    meetingId: row.meeting_id,
    passwordHash: row.password_hash,
    hostEmail: row.host_email,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    isActive: row.is_active,
  };
};

const fetchActiveMeetingRoom = async (meetingId) => {
  const { rows } = await supabase.select("meeting_rooms", {
    select: selectMeetingRoomColumns,
    filters: [
      { column: "meeting_id", operator: "eq", value: meetingId },
      { column: "is_active", operator: "eq", value: true },
    ],
    limit: 1,
  });
  return mapMeetingRoomRow(rows[0]);
};

let cachedPolicy = null;
let cachedPolicyAt = 0;
const POLICY_CACHE_MS = 15 * 1000;

const getEffectivePolicy = async () => {
  const now = Date.now();
  if (cachedPolicy && now - cachedPolicyAt < POLICY_CACHE_MS) {
    return cachedPolicy;
  }

  const policy = await ensureAdminPolicy();
  cachedPolicy = {
    allowGuestJoin: policy?.allow_guest_join !== false,
    enforceWaitingRoom: policy?.enforce_waiting_room === true,
  };
  cachedPolicyAt = now;
  return cachedPolicy;
};

const broadcastSystemMessage = (io, roomId, text) => {
  const payload = createSystemMessage(text);
  pushMessage(roomId, payload);
  io.to(roomId).emit("system-message", payload);
};

const initializeParticipant = (socketId, username, role = "guest") => {
  participantState[socketId] = {
    username,
    isMuted: false,
    isVideoOff: false,
    audioLocked: false,
    videoLocked: false,
    handRaised: false,
    role,
  };
};

const removeSocketFromRoom = (io, socketId, reason = "removed") => {
  const roomId = getRoomFromSocket(socketId);
  if (!roomId) {
    return;
  }

  const leftParticipant = participantState[socketId] || {
    username: `Guest-${socketId.slice(0, 5)}`,
    role: "guest",
  };

  connections[roomId] = (connections[roomId] || []).filter((id) => id !== socketId);
  waitingRooms[roomId] = (waitingRooms[roomId] || []).filter((request) => request.socketId !== socketId);
  if (roomSettings[roomId]?.unmuteRequests) {
    roomSettings[roomId].unmuteRequests = roomSettings[roomId].unmuteRequests.filter(
      (request) => request.socketId !== socketId
    );
  }

  delete socketToRoom[socketId];
  delete participantState[socketId];
  delete timeOnline[socketId];

  io.to(socketId).emit("removed-from-room", { reason });
  io.to(roomId).emit("user-left", {
    socketId,
    username: leftParticipant.username,
    participants: getParticipants(roomId),
  });

  emitParticipants(io, roomId);
  emitWaitingRoomStateToHosts(io, roomId);
  emitUnmuteRequestsToModerators(io, roomId);

  if (reason === "removed_by_host") {
    broadcastSystemMessage(io, roomId, `${leftParticipant.username} was removed by host`);
  } else {
    broadcastSystemMessage(io, roomId, `${leftParticipant.username} left the meeting`);
  }

  if ((connections[roomId] || []).length === 0) {
    delete connections[roomId];
    delete messages[roomId];
    delete directMessages[roomId];
    delete roomSettings[roomId];
    delete waitingRooms[roomId];
  }
};

const endMeetingForAll = (io, roomId, initiatedBySocketId) => {
  const roomMembers = [...(connections[roomId] || [])];
  if (roomMembers.length === 0) {
    return;
  }

  const initiatorName =
    participantState[initiatedBySocketId]?.username || "Host";

  io.to(roomId).emit("meeting-ended", {
    roomId,
    by: initiatorName,
    at: new Date().toISOString(),
  });

  roomMembers.forEach((memberSocketId) => {
    io.sockets.sockets.get(memberSocketId)?.disconnect(true);
  });

  delete connections[roomId];
  delete messages[roomId];
  delete directMessages[roomId];
  delete roomSettings[roomId];
  delete waitingRooms[roomId];
  if (roomExpiryTimers[roomId]) {
    clearTimeout(roomExpiryTimers[roomId]);
    delete roomExpiryTimers[roomId];
  }
};

const scheduleRoomExpiry = (io, roomId, endAt) => {
  if (!endAt) {
    return;
  }
  if (roomExpiryTimers[roomId]) {
    clearTimeout(roomExpiryTimers[roomId]);
    delete roomExpiryTimers[roomId];
  }

  const endTime = new Date(endAt).getTime();
  const now = Date.now();
  const remainingMs = endTime - now;

  const expireNow = async () => {
    const roomMembers = [...(connections[roomId] || [])];
    if (roomMembers.length > 0) {
      io.to(roomId).emit("meeting-ended", {
        roomId,
        by: "System",
        reason: "session_expired",
        at: new Date().toISOString(),
      });
      roomMembers.forEach((memberSocketId) => {
        io.sockets.sockets.get(memberSocketId)?.disconnect(true);
      });
    }

    delete connections[roomId];
    delete messages[roomId];
    delete directMessages[roomId];
    delete roomSettings[roomId];
    delete waitingRooms[roomId];
    if (roomExpiryTimers[roomId]) {
      clearTimeout(roomExpiryTimers[roomId]);
      delete roomExpiryTimers[roomId];
    }

    try {
      await supabase.update(
        "meeting_rooms",
        { is_active: false },
        {
          filters: [
            { column: "meeting_id", operator: "eq", value: roomId },
            { column: "is_active", operator: "eq", value: true },
          ],
          returning: false,
        }
      );
    } catch (error) {
      console.log(error);
    }
  };

  if (remainingMs <= 0) {
    expireNow();
    return;
  }

  roomExpiryTimers[roomId] = setTimeout(expireNow, remainingMs);
};

export const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("SOMETHING CONNECTED");

    socket.on("join-call", async (payload) => {
      const roomId = typeof payload === "string" ? payload : payload?.roomId;
      const username =
        typeof payload === "string"
          ? `Guest-${socket.id.slice(0, 5)}`
          : payload?.username || `Guest-${socket.id.slice(0, 5)}`;
      const userEmail =
        typeof payload === "string" ? "" : String(payload?.userEmail || "").toLowerCase().trim();
      const providedPassword =
        typeof payload === "string" ? "" : String(payload?.password || "").trim();

      if (!roomId) {
        return;
      }

      try {
        const meetingRoom = await fetchActiveMeetingRoom(roomId);
        if (!meetingRoom) {
          io.to(socket.id).emit("waiting-room-status", {
            status: "meeting_not_found",
            roomId,
          });
          return;
        }

        const now = new Date();
        if (now < new Date(meetingRoom.scheduledStartAt)) {
          io.to(socket.id).emit("waiting-room-status", {
            status: "not_started",
            roomId,
            startAt: meetingRoom.scheduledStartAt,
          });
          return;
        }
        if (now > new Date(meetingRoom.scheduledEndAt)) {
          await supabase.update(
            "meeting_rooms",
            { is_active: false },
            { filters: [{ column: "id", operator: "eq", value: meetingRoom._id }], returning: false }
          );
          io.to(socket.id).emit("waiting-room-status", {
            status: "session_expired",
            roomId,
          });
          return;
        }

        const passwordValid = await bcrypt.compare(providedPassword, meetingRoom.passwordHash);
        if (!passwordValid) {
          io.to(socket.id).emit("waiting-room-status", {
            status: "invalid_password",
            roomId,
          });
          return;
        }

        ensureRoom(roomId);
        const adminPolicy = await getEffectivePolicy();
        const normalizedUsername =
          String(username).trim().slice(0, 40) || `Guest-${socket.id.slice(0, 5)}`;
        const role = userEmail && meetingRoom.hostEmail === userEmail ? "host" : "guest";

        if (!adminPolicy.allowGuestJoin && role !== "host") {
          io.to(socket.id).emit("waiting-room-status", {
            status: "policy_restricted",
            roomId,
          });
          return;
        }

        const roomHasParticipants = (connections[roomId] || []).length > 0;
        const waitingRoomRequired =
          (roomHasParticipants && roomSettings[roomId].isLocked) || (adminPolicy.enforceWaitingRoom && role !== "host");
        if (waitingRoomRequired) {
          waitingRooms[roomId].push({
            socketId: socket.id,
            username: normalizedUsername,
            userEmail,
            requestedAt: new Date().toISOString(),
          });
          io.to(socket.id).emit("waiting-room-status", {
            status: "pending",
            roomId,
          });
          emitWaitingRoomStateToHosts(io, roomId);
          return;
        }

        if (!connections[roomId].includes(socket.id)) {
          connections[roomId].push(socket.id);
        }

        socketToRoom[socket.id] = roomId;
        timeOnline[socket.id] = new Date();
        socket.join(roomId);

        initializeParticipant(socket.id, normalizedUsername, role);

        io.to(roomId).emit("user-joined", {
          joinedUser: {
            socketId: socket.id,
            username: participantState[socket.id]?.username,
          },
          participants: getParticipants(roomId),
          clientIds: connections[roomId],
        });

        io.to(socket.id).emit("waiting-room-status", { status: "admitted", roomId });
        const isMod = isModerator(socket.id, roomId);
        if (!isMod) {
          ensureDirectThread(roomId, socket.id);
        }
        const directHistory = isMod
          ? Object.values(directMessages[roomId] || {}).flat()
          : directMessages[roomId]?.[socket.id] || [];
        io.to(socket.id).emit("chat-history", [...(messages[roomId] || []), ...directHistory]);
        emitParticipants(io, roomId);
        emitRoomSettings(io, roomId);
        emitWaitingRoomStateToHosts(io, roomId);
        emitUnmuteRequestsToModerators(io, roomId);
        scheduleRoomExpiry(io, roomId, meetingRoom.scheduledEndAt);
        broadcastSystemMessage(io, roomId, `${participantState[socket.id]?.username} joined the meeting`);
      } catch (error) {
        io.to(socket.id).emit("waiting-room-status", {
          status: "join_failed",
          roomId,
          message: error.message,
        });
      }
    });

    socket.on("signal", (toId, message) => {
      io.to(toId).emit("signal", socket.id, message);
    });

    socket.on("participant-status-update", (payload = {}) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !participantState[socket.id]) {
        return;
      }

      const nextState = { ...participantState[socket.id] };

      if (payload.isMuted !== undefined) {
        const desiredMuted = Boolean(payload.isMuted);
        if (!desiredMuted && nextState.audioLocked && !canBypassPolicy(socket.id, roomId)) {
          nextState.isMuted = true;
          io.to(socket.id).emit("force-mute");
        } else {
          nextState.isMuted = desiredMuted;
        }
      }

      if (payload.isVideoOff !== undefined) {
        const desiredVideoOff = Boolean(payload.isVideoOff);
        if (!desiredVideoOff && nextState.videoLocked && !canBypassPolicy(socket.id, roomId)) {
          nextState.isVideoOff = true;
          io.to(socket.id).emit("force-video-off");
        } else {
          nextState.isVideoOff = desiredVideoOff;
        }
      }

      participantState[socket.id] = nextState;

      emitParticipants(io, roomId);
    });

    socket.on("request-unmute", () => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !participantState[socket.id]) {
        return;
      }
      if (isModerator(socket.id, roomId)) {
        return;
      }

      ensureRoom(roomId);
      const existing = (roomSettings[roomId].unmuteRequests || []).some(
        (request) => request.socketId === socket.id
      );
      if (existing) {
        return;
      }

      roomSettings[roomId].unmuteRequests.push({
        socketId: socket.id,
        username: participantState[socket.id].username,
        requestedAt: new Date().toISOString(),
      });
      emitUnmuteRequestsToModerators(io, roomId);
      broadcastSystemMessage(io, roomId, `${participantState[socket.id].username} requested to unmute`);
    });

    socket.on("toggle-hand", (isRaised) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !participantState[socket.id]) {
        return;
      }

      participantState[socket.id].handRaised = Boolean(isRaised);
      emitParticipants(io, roomId);
    });

    socket.on("reaction", (emoji) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !participantState[socket.id]) {
        return;
      }
      if (!roomSettings[roomId]?.allowReactions && !canBypassPolicy(socket.id, roomId)) {
        return;
      }

      const reaction = String(emoji || "").trim();
      if (!ALLOWED_REACTIONS.includes(reaction)) {
        return;
      }

      io.to(roomId).emit("reaction", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        socketId: socket.id,
        username: participantState[socket.id].username,
        emoji: reaction,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on("toggle-lock-room", (isLocked) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isHost(socket.id, roomId)) {
        return;
      }

      roomSettings[roomId].isLocked = Boolean(isLocked);
      emitRoomSettings(io, roomId);
      broadcastSystemMessage(
        io,
        roomId,
        roomSettings[roomId].isLocked
          ? "Host locked the meeting"
          : "Host unlocked the meeting"
      );
    });

    socket.on("toggle-room-permission", (payload = {}) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isHost(socket.id, roomId)) {
        return;
      }

      const key = String(payload.key || "");
      const value = Boolean(payload.value);
      const allowedKeys = ["allowChat", "allowReactions", "allowScreenShare"];
      if (!allowedKeys.includes(key)) {
        return;
      }

      roomSettings[roomId][key] = value;
      emitRoomSettings(io, roomId);

      const labelMap = {
        allowChat: "chat",
        allowReactions: "reactions",
        allowScreenShare: "screen sharing",
      };

    broadcastSystemMessage(
        io,
        roomId,
        `Host ${value ? "enabled" : "disabled"} ${labelMap[key]}`
      );
    });

    socket.on("set-video-quality", (quality) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isHost(socket.id, roomId)) {
        return;
      }

      const allowed = ["auto", "360p", "720p"];
      const normalizedQuality = allowed.includes(quality) ? quality : "auto";
      roomSettings[roomId].videoQuality = normalizedQuality;
      emitRoomSettings(io, roomId);
      broadcastSystemMessage(io, roomId, `Host set video quality to ${normalizedQuality}`);
    });

    socket.on("mute-all", () => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId)) {
        return;
      }

      (connections[roomId] || []).forEach((participantId) => {
        if (participantId === socket.id) {
          return;
        }
        if (canBypassPolicy(participantId, roomId)) {
          return;
        }
        if (participantState[participantId]) {
          participantState[participantId].isMuted = true;
          participantState[participantId].audioLocked = true;
        }
        io.to(participantId).emit("force-mute");
      });

      emitParticipants(io, roomId);
      broadcastSystemMessage(io, roomId, "Moderator muted all participants");
    });

    socket.on("mute-participant", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId) || !targetSocketId) {
        return;
      }
      if (targetSocketId === socket.id) {
        return;
      }
      if (canBypassPolicy(targetSocketId, roomId)) {
        return;
      }

      if (participantState[targetSocketId]) {
        participantState[targetSocketId].isMuted = true;
        participantState[targetSocketId].audioLocked = true;
      }
      io.to(targetSocketId).emit("force-mute");
      emitParticipants(io, roomId);

      const targetName = participantState[targetSocketId]?.username || "Participant";
      broadcastSystemMessage(io, roomId, `${targetName} was muted by moderator`);
    });

    socket.on("video-off-all", () => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId)) {
        return;
      }

      (connections[roomId] || []).forEach((participantId) => {
        if (participantId === socket.id) {
          return;
        }
        if (canBypassPolicy(participantId, roomId)) {
          return;
        }
        if (participantState[participantId]) {
          participantState[participantId].isVideoOff = true;
          participantState[participantId].videoLocked = true;
        }
        io.to(participantId).emit("force-video-off");
      });

      emitParticipants(io, roomId);
      broadcastSystemMessage(io, roomId, "Moderator stopped all participant videos");
    });

    socket.on("video-off-participant", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId) || !targetSocketId) {
        return;
      }
      if (targetSocketId === socket.id) {
        return;
      }
      if (canBypassPolicy(targetSocketId, roomId)) {
        return;
      }

      if (participantState[targetSocketId]) {
        participantState[targetSocketId].isVideoOff = true;
        participantState[targetSocketId].videoLocked = true;
      }
      io.to(targetSocketId).emit("force-video-off");
      emitParticipants(io, roomId);

      const targetName = participantState[targetSocketId]?.username || "Participant";
      broadcastSystemMessage(io, roomId, `${targetName}'s camera was stopped by moderator`);
    });

    socket.on("video-allow-participant", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId) || !targetSocketId) {
        return;
      }
      if (targetSocketId === socket.id) {
        return;
      }
      if (canBypassPolicy(targetSocketId, roomId)) {
        return;
      }

      if (participantState[targetSocketId]) {
        participantState[targetSocketId].videoLocked = false;
      }

      io.to(targetSocketId).emit("video-approved");
      emitParticipants(io, roomId);
      const targetName = participantState[targetSocketId]?.username || "Participant";
      broadcastSystemMessage(io, roomId, `${targetName} was allowed to turn on camera`);
    });

    socket.on("approve-unmute", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId) || !targetSocketId) {
        return;
      }

      if (roomSettings[roomId]?.unmuteRequests) {
        roomSettings[roomId].unmuteRequests = roomSettings[roomId].unmuteRequests.filter(
          (request) => request.socketId !== targetSocketId
        );
      }

      if (participantState[targetSocketId]) {
        participantState[targetSocketId].isMuted = false;
        participantState[targetSocketId].audioLocked = false;
      }

      io.to(targetSocketId).emit("unmute-approved");
      emitParticipants(io, roomId);
      emitUnmuteRequestsToModerators(io, roomId);
      const targetName = participantState[targetSocketId]?.username || "Participant";
      broadcastSystemMessage(io, roomId, `${targetName} was allowed to unmute`);
    });

    socket.on("deny-unmute", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId) || !targetSocketId) {
        return;
      }

      if (roomSettings[roomId]?.unmuteRequests) {
        roomSettings[roomId].unmuteRequests = roomSettings[roomId].unmuteRequests.filter(
          (request) => request.socketId !== targetSocketId
        );
      }

      io.to(targetSocketId).emit("unmute-denied");
      emitUnmuteRequestsToModerators(io, roomId);
    });

    socket.on("remove-participant", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId)) {
        return;
      }
      if (!targetSocketId || targetSocketId === socket.id) {
        return;
      }
      if (isHost(targetSocketId, roomId)) {
        return;
      }
      if (
        participantState[socket.id]?.role === "cohost" &&
        participantState[targetSocketId]?.role === "cohost"
      ) {
        return;
      }

      removeSocketFromRoom(io, targetSocketId, "removed_by_host");
      io.sockets.sockets.get(targetSocketId)?.disconnect(true);
    });

    socket.on("promote-cohost", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isHost(socket.id, roomId) || !targetSocketId || !participantState[targetSocketId]) {
        return;
      }
      if (participantState[targetSocketId].role === "host") {
        return;
      }
      participantState[targetSocketId].role = "cohost";
      emitParticipants(io, roomId);
      broadcastSystemMessage(io, roomId, `${participantState[targetSocketId].username} is now a co-host`);
      emitWaitingRoomStateToHosts(io, roomId);
      emitUnmuteRequestsToModerators(io, roomId);
    });

    socket.on("demote-cohost", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isHost(socket.id, roomId) || !targetSocketId || !participantState[targetSocketId]) {
        return;
      }
      if (participantState[targetSocketId].role !== "cohost") {
        return;
      }
      participantState[targetSocketId].role = "guest";
      emitParticipants(io, roomId);
      broadcastSystemMessage(io, roomId, `${participantState[targetSocketId].username} is now a participant`);
      emitWaitingRoomStateToHosts(io, roomId);
      emitUnmuteRequestsToModerators(io, roomId);
    });

    socket.on("end-meeting-for-all", () => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isHost(socket.id, roomId)) {
        return;
      }

      endMeetingForAll(io, roomId, socket.id);
    });

    socket.on("admit-from-waiting-room", async (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId)) {
        return;
      }

      const requestIndex = (waitingRooms[roomId] || []).findIndex(
        (request) => request.socketId === targetSocketId
      );
      if (requestIndex === -1) {
        return;
      }

      const [request] = waitingRooms[roomId].splice(requestIndex, 1);
      emitWaitingRoomStateToHosts(io, roomId);

      if (!connections[roomId].includes(request.socketId)) {
        connections[roomId].push(request.socketId);
      }
      socketToRoom[request.socketId] = roomId;
      timeOnline[request.socketId] = new Date();
      io.sockets.sockets.get(request.socketId)?.join(roomId);

      const meetingRoom = await fetchActiveMeetingRoom(roomId);
      const role =
        meetingRoom && meetingRoom.hostEmail === String(request.userEmail || "").toLowerCase().trim()
          ? "host"
          : "guest";
      initializeParticipant(request.socketId, request.username, role);

      io.to(request.socketId).emit("waiting-room-status", { status: "admitted", roomId });
      ensureDirectThread(roomId, request.socketId);
      io.to(request.socketId).emit("chat-history", [...(messages[roomId] || []), ...(directMessages[roomId]?.[request.socketId] || [])]);

      io.to(roomId).emit("user-joined", {
        joinedUser: {
          socketId: request.socketId,
            username: participantState[request.socketId]?.username,
        },
        participants: getParticipants(roomId),
        clientIds: connections[roomId],
      });

      emitParticipants(io, roomId);
      emitRoomSettings(io, roomId);
      emitUnmuteRequestsToModerators(io, roomId);
      broadcastSystemMessage(
        io,
        roomId,
        `${participantState[request.socketId]?.username} joined from waiting room`
      );
    });

    socket.on("reject-from-waiting-room", (targetSocketId) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !isModerator(socket.id, roomId)) {
        return;
      }

      waitingRooms[roomId] = (waitingRooms[roomId] || []).filter(
        (request) => request.socketId !== targetSocketId
      );
      emitWaitingRoomStateToHosts(io, roomId);
      io.to(targetSocketId).emit("waiting-room-status", { status: "rejected", roomId });
      io.sockets.sockets.get(targetSocketId)?.disconnect(true);
    });

    socket.on("chat-message", (payload, legacySender) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId) {
        return;
      }
      if (!roomSettings[roomId]?.allowChat && !canBypassPolicy(socket.id, roomId)) {
        return;
      }

      const isModSender = isModerator(socket.id, roomId);
      const text = typeof payload === "string" ? payload : payload?.text;
      const sender =
        typeof payload === "string"
          ? legacySender || participantState[socket.id]?.username || "Guest"
          : payload?.sender || participantState[socket.id]?.username || "Guest";
      const toSocketIdRaw = isModSender && payload && typeof payload === "object" ? payload?.toSocketId : "";
      const toSocketId = String(toSocketIdRaw || "").trim();

      if (!text || !String(text).trim()) {
        return;
      }

      if (isModSender && !toSocketId) {
        return;
      }

      if (isModSender && (!connections[roomId] || !connections[roomId].includes(toSocketId))) {
        return;
      }

      if (isModSender && canBypassPolicy(toSocketId, roomId)) {
        return;
      }

      const threadKey = isModSender ? toSocketId : socket.id;
      const messagePayload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "chat",
        text: String(text).trim().slice(0, 2000),
        sender: String(sender).trim().slice(0, 40),
        socketId: socket.id,
        threadKey,
        toSocketId: isModSender ? toSocketId : null,
        createdAt: new Date().toISOString(),
      };

      pushDirectMessage(roomId, threadKey, messagePayload);

      const recipients = new Set();
      recipients.add(socket.id);
      getModeratorsInRoom(roomId).forEach((moderatorId) => recipients.add(moderatorId));
      if (isModSender) {
        recipients.add(toSocketId);
      }

      recipients.forEach((socketId) => {
        io.to(socketId).emit("chat-message", messagePayload);
      });
    });

    socket.on("typing", (isTyping) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !participantState[socket.id]) {
        return;
      }

      const isModSender = isModerator(socket.id, roomId);
      const normalized =
        isTyping && typeof isTyping === "object"
          ? isTyping
          : { isTyping: Boolean(isTyping) };
      const nextTyping = Boolean(normalized?.isTyping);
      const toSocketIdRaw = isModSender ? normalized?.toSocketId : "";
      const toSocketId = String(toSocketIdRaw || "").trim();

      if (isModSender) {
        if (!toSocketId) {
          return;
        }
        if (!connections[roomId] || !connections[roomId].includes(toSocketId)) {
          return;
        }
        if (canBypassPolicy(toSocketId, roomId)) {
          return;
        }

        io.to(toSocketId).emit("typing", {
          threadKey: toSocketId,
          socketId: socket.id,
          username: participantState[socket.id].username,
          isTyping: nextTyping,
        });
        return;
      }

      getModeratorsInRoom(roomId).forEach((moderatorId) => {
        io.to(moderatorId).emit("typing", {
          threadKey: socket.id,
          socketId: socket.id,
          username: participantState[socket.id].username,
          isTyping: nextTyping,
        });
      });
    });

    socket.on("speaking", (isSpeaking) => {
      const roomId = getRoomFromSocket(socket.id);
      if (!roomId || !participantState[socket.id]) {
        return;
      }

      socket.to(roomId).emit("speaking", {
        socketId: socket.id,
        username: participantState[socket.id].username,
        isSpeaking: Boolean(isSpeaking),
        at: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      const roomId = getRoomFromSocket(socket.id);

      if (waitingRooms[roomId]) {
        waitingRooms[roomId] = waitingRooms[roomId].filter(
          (request) => request.socketId !== socket.id
        );
        emitWaitingRoomStateToHosts(io, roomId);
      }

      if (timeOnline[socket.id]) {
        const diffTime = Math.abs(new Date() - timeOnline[socket.id]);
        console.log(`Socket ${socket.id} disconnected after ${diffTime} ms`);
      }

      if (!roomId) {
        delete participantState[socket.id];
        delete timeOnline[socket.id];
        delete socketToRoom[socket.id];
        return;
      }

      removeSocketFromRoom(io, socket.id, "disconnect");
    });
  });

  return io;
};
