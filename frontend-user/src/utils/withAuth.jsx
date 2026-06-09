import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const hasCompletedOnboardingForCurrentUser = () => {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return false;

    try {
        const parsedUser = JSON.parse(rawUser);
        const uniqueUser = parsedUser.email || parsedUser.username || parsedUser._id || "default";
        return localStorage.getItem(`onboarding_completed_${uniqueUser}`) === "1";
    } catch {
        return false;
    }
};

const withAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        const router = useNavigate();
        const location = useLocation();

        const isAuthenticated = () => {
            const token = localStorage.getItem("token");
            if (!token) return false;

            const expiresAtRaw = localStorage.getItem("token_expires_at");
            if (expiresAtRaw) {
                const expiresAt = new Date(expiresAtRaw);
                if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("token_expires_at");
                    localStorage.removeItem("user");
                    return false;
                }
            }

            return true;
        };

        useEffect(() => {
            if (!isAuthenticated()) {
                router("/auth");
                return;
            }

            const isOnboardingPage = location.pathname === "/onboarding";
            if (!hasCompletedOnboardingForCurrentUser() && !isOnboardingPage) {
                router("/onboarding");
            }
        }, [location.pathname, router]);

        return <WrappedComponent {...props} />;
    };

    return AuthComponent;
};

export default withAuth;
