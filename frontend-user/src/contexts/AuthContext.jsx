import axios from "axios";
import httpStatus from "http-status";
import { createContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import server from "../environment";

export const AuthContext = createContext({});

const client = axios.create({
    baseURL: `${server}/api/v1/users`
});

const meetingClient = axios.create({
    baseURL: `${server}/api/v1/meetings`
});

client.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

meetingClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

const getOnboardingKey = (user) => {
    if (!user) return "";
    const uniqueUser = user.email || user.username || user._id || "default";
    return `onboarding_completed_${uniqueUser}`;
};

const hasCompletedOnboardingForUser = (user) => {
    const key = getOnboardingKey(user);
    return key ? localStorage.getItem(key) === "1" : false;
};

const markOnboardingDoneForUser = (user) => {
    const key = getOnboardingKey(user);
    if (key) {
        localStorage.setItem(key, "1");
    }
};

export const AuthProvider = ({ children }) => {
    const router = useNavigate();
    const [userData, setUserData] = useState(() => {
        const raw = localStorage.getItem("user");
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    });

    const checkAuthPreflight = async (email) => {
        const response = await client.post("/auth/preflight", { email });
        return response.data;
    };

    const requestAuthOtp = async (email, purpose = "auth") => {
        const response = await client.post("/auth/otp/request", { email, purpose });
        return response.data;
    };

    const verifyAuthOtp = async (email, otp, purpose = "auth") => {
        const response = await client.post("/auth/otp/verify", { email, otp, purpose });
        return response.data;
    };

    const requestPasswordReset = async (email) => {
        const response = await client.post("/password/forgot", { email });
        return response.data;
    };

    const resetPassword = async ({ token, email, password }) => {
        const response = await client.post("/password/reset", { token, email, password });
        return response.data;
    };

    const getMe = async () => {
        const response = await client.get("/me");
        return response.data;
    };

    const updateMe = async (payload = {}) => {
        const response = await client.patch("/me", payload);
        const nextUser = response.data?.user || null;

        if (nextUser) {
            localStorage.setItem("user", JSON.stringify(nextUser));
            setUserData(nextUser);
        }

        const nextProfile = response.data?.profile || null;
        if (nextProfile) {
            if (typeof nextProfile.displayName === "string") {
                localStorage.setItem("meeting_display_name", nextProfile.displayName);
            }
            if (typeof nextProfile.organization === "string") {
                localStorage.setItem("org_name", nextProfile.organization);
            }
            if (typeof nextProfile.workRole === "string") {
                localStorage.setItem("work_role", nextProfile.workRole);
            }
        }

        return response.data;
    };

    const handleRegister = async (name, username, email, password, verificationToken, accountType = "user") => {
        const response = await client.post("/register", {
            name,
            username,
            email,
            password,
            verificationToken,
            accountType,
        });

        if (response.status === httpStatus.CREATED) {
            return response.data.message;
        }

        throw new Error("Unable to register user");
    };

    const handleLogin = async ({ username, email, password, verificationToken }) => {
        const response = await client.post("/login", {
            username,
            email,
            password,
            verificationToken,
        });

        if (response.status !== httpStatus.OK) {
            throw new Error("Unable to login");
        }

        const loggedInUser = response.data.user;
        localStorage.setItem("token", response.data.token);
        if (response.data.expiresAt) {
            localStorage.setItem("token_expires_at", String(response.data.expiresAt));
        } else {
            localStorage.removeItem("token_expires_at");
        }
        localStorage.setItem("user", JSON.stringify(loggedInUser));
        setUserData(loggedInUser);

        if (hasCompletedOnboardingForUser(loggedInUser)) {
            router("/home");
            return;
        }

        router("/onboarding");
    };

    useEffect(() => {
        const handleAuthFailure = (error) => {
            const status = error?.response?.status;
            const message = String(error?.response?.data?.message || "");
            const normalized = message.toLowerCase();

            const isSessionFailure =
                status === 401 &&
                (normalized.includes("authentication token") ||
                    normalized.includes("invalid authentication token") ||
                    normalized.includes("session expired"));

            const isDisabledAccount = status === 403 && normalized.includes("disabled");

            if (isSessionFailure || isDisabledAccount) {
                localStorage.removeItem("token");
                localStorage.removeItem("token_expires_at");
                localStorage.removeItem("user");
                setUserData(null);
                router("/auth");
            }
            return Promise.reject(error);
        };

        const clientInterceptor = client.interceptors.response.use((response) => response, handleAuthFailure);
        const meetingInterceptor = meetingClient.interceptors.response.use((response) => response, handleAuthFailure);

        return () => {
            client.interceptors.response.eject(clientInterceptor);
            meetingClient.interceptors.response.eject(meetingInterceptor);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const completeUserOnboarding = () => {
        const rawUser = localStorage.getItem("user");
        if (!rawUser) {
            return;
        }

        try {
            const parsedUser = JSON.parse(rawUser);
            markOnboardingDoneForUser(parsedUser);
        } catch {
            // Ignore malformed local cache.
        }
    };

    const hasCompletedOnboarding = useMemo(() => {
        return hasCompletedOnboardingForUser(userData);
    }, [userData]);

    const handleLogout = async () => {
        try {
            await client.post("/logout");
        } catch {
            // Local logout should still happen even if server fails.
        }

        localStorage.removeItem("token");
        localStorage.removeItem("token_expires_at");
        localStorage.removeItem("user");
        setUserData(null);
        router("/auth");
    };

    const getHistoryOfUser = async () => {
        const response = await client.get("/activity");
        return response.data;
    };

    const addToUserHistory = async (meetingCode) => {
        const response = await client.post("/activity", {
            meeting_code: meetingCode,
        });
        return response.data;
    };

    const createMeetingRoom = async (payload = {}) => {
        const response = await meetingClient.post("/", payload);
        return response.data;
    };

    const validateMeetingAccess = async (meetingId, password) => {
        const response = await meetingClient.post(`/${meetingId}/join`, { password });
        return response.data;
    };

    const getScheduledHostMeetings = async () => {
        const response = await meetingClient.get("/host/scheduled");
        return response.data;
    };

    const rescheduleHostMeeting = async (meetingId, payload) => {
        const response = await meetingClient.patch(`/${meetingId}/schedule`, payload);
        return response.data;
    };

    const cancelHostMeeting = async (meetingId) => {
        const response = await meetingClient.patch(`/${meetingId}/cancel`);
        return response.data;
    };

    const startHostMeeting = async (meetingId) => {
        const response = await meetingClient.patch(`/${meetingId}/start`);
        return response.data;
    };

    const data = {
        userData,
        setUserData,
        hasCompletedOnboarding,
        completeUserOnboarding,
        checkAuthPreflight,
        requestAuthOtp,
        verifyAuthOtp,
        requestPasswordReset,
        resetPassword,
        addToUserHistory,
        getHistoryOfUser,
        createMeetingRoom,
        validateMeetingAccess,
        getScheduledHostMeetings,
        rescheduleHostMeeting,
        cancelHostMeeting,
        startHostMeeting,
        handleRegister,
        handleLogin,
        handleLogout,
        getMe,
        updateMe,
    };

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    );
};
