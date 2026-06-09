import React, { useContext, useEffect, useMemo, useState } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate } from 'react-router-dom'
import "../App.css";
import { Button, IconButton, Snackbar, TextField } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { AuthContext } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';

function HomeComponent() {
    const navigate = useNavigate();
    const [recentMeetings, setRecentMeetings] = useState([]);
    const [quickJoinCode, setQuickJoinCode] = useState("");
    const [quickJoinPassword, setQuickJoinPassword] = useState("");
    const [displayName, setDisplayName] = useState(() => localStorage.getItem("meeting_display_name") || "");
    const [favoriteMeetingCodes, setFavoriteMeetingCodes] = useState(() => {
        try {
            const raw = localStorage.getItem("favorite_meetings");
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [error, setError] = useState("");

    const { getHistoryOfUser, validateMeetingAccess, addToUserHistory, userData } = useContext(AuthContext);

    useEffect(() => {
        const loadRecentMeetings = async () => {
            try {
                const history = await getHistoryOfUser();
                setRecentMeetings(Array.isArray(history) ? history : []);
            } catch (e) {
                setError(e?.response?.data?.message || "Unable to load recent meetings.");
            }
        };

        loadRecentMeetings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scrollToSection = (sectionId) => {
        const element = document.getElementById(sectionId);
        if (!element) return;
        element.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    useEffect(() => {
        const elements = Array.from(document.querySelectorAll("[data-reveal='home']"));
        if (elements.length === 0) return undefined;

        elements.forEach((el) => el.classList.add("reveal-ready"));

        const prefersReduced =
            typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReduced) {
            elements.forEach((el) => el.classList.add("is-visible"));
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.12 }
        );

        elements.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        localStorage.setItem("meeting_display_name", displayName.trim());
    }, [displayName]);

    useEffect(() => {
        localStorage.setItem("favorite_meetings", JSON.stringify(favoriteMeetingCodes));
    }, [favoriteMeetingCodes]);

    const distinctRecentMeetings = useMemo(() => {
        const seen = new Set();
        const unique = recentMeetings
            .filter((item) => {
                if (!item?.meetingCode || seen.has(item.meetingCode)) {
                    return false;
                }
                seen.add(item.meetingCode);
                return true;
            })
            .map((meeting) => ({
                ...meeting,
                isFavorite: favoriteMeetingCodes.includes(meeting.meetingCode),
            }));

        unique.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
        return unique.slice(0, 6);
    }, [recentMeetings, favoriteMeetingCodes]);

    const formatLastJoined = (dateInput) => {
        if (!dateInput) return "Unknown";
        const date = new Date(dateInput);
        if (Number.isNaN(date.getTime())) return "Unknown";
        return date.toLocaleString([], {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const toggleFavorite = (meetingCode) => {
        setFavoriteMeetingCodes((prev) =>
            prev.includes(meetingCode)
                ? prev.filter((code) => code !== meetingCode)
                : [...prev, meetingCode]
        );
    };

    const handleQuickJoin = async (meetingCode, meetingPassword) => {
        const code = String(meetingCode || "").trim();
        const password = String(meetingPassword || "").trim();
        if (!code || !password) {
            setError("Meeting code and password are required.");
            return;
        }

        try {
            await validateMeetingAccess(code, password);
            await addToUserHistory(code);
            navigate(`/meeting/${code}?password=${encodeURIComponent(password)}`);
        } catch (e) {
            setError(e?.response?.data?.message || "Unable to join meeting.");
        }
    };

    const handleRejoin = async (meetingCode) => {
        const password = window.prompt(`Enter password for meeting ${meetingCode}`);
        if (!password) return;
        await handleQuickJoin(meetingCode, password);
    };

    return (
        <AppShell center={false} maxWidth="xl">
            <div className="homeDashboard">
                <div className="homeStatusStrip" data-reveal="home" style={{ transitionDelay: "20ms" }}>
                    <div className="homeStatusPills">
                        <span><ShieldOutlinedIcon fontSize="inherit" /> TLS</span>
                        <span><LockOutlinedIcon fontSize="inherit" /> Password protected</span>
                        <span><VerifiedUserOutlinedIcon fontSize="inherit" /> Secure session</span>
                    </div>
                </div>

                <header className="homeHeroCard" data-reveal="home">
                    <div className="homeHeroCopy" data-reveal="home" style={{ transitionDelay: "60ms" }}>
                        <p className="meetingModeOverline">Workspace</p>
                        <h1>Host and Join Meetings Securely</h1>
                        <p className="homeHeroText">
                            Separate host/join flows, protected meeting access, and quick rejoin controls.
                        </p>
                        <div className="homeHeroActions">
                            <Button variant="contained" onClick={() => navigate("/join")}>
                                Join meeting
                            </Button>
                            {userData?.role === "host" ? (
                                <Button variant="outlined" onClick={() => navigate("/host")}>
                                    Host meeting
                                </Button>
                            ) : (
                                <Button variant="outlined" onClick={() => scrollToSection("home-showcase")}>
                                    Explore features
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="homeHeroVisual" data-reveal="home" style={{ transitionDelay: "120ms" }}>
                        <img src="/home-feature-2.avif" alt="Zomeetix meeting workspace" />
                    </div>
                </header>

                <div className="homeMainGrid">
                    <section className="homeMainLeft" data-reveal="home" style={{ transitionDelay: "160ms" }}>
                        <div className="meetingModeGrid homeCardGrid">
                            <div className="meetingModeCard" data-reveal="home" style={{ transitionDelay: "200ms" }}>
                                <p className="meetingModeOverline">Participant</p>
                                <h3>Join a Meeting</h3>
                                <p>Enter meeting ID and password to join a host session.</p>
                                <Button variant="contained" onClick={() => navigate("/join")}>
                                    Open Join Page
                                </Button>
                            </div>

                            {userData?.role === "host" ? (
                                <div className="meetingModeCard" data-reveal="home" style={{ transitionDelay: "240ms" }}>
                                    <p className="meetingModeOverline">Organizer</p>
                                    <h3>Host a Meeting</h3>
                                    <p>Create a scheduled meeting with secure link + password.</p>
                                    <Button variant="outlined" onClick={() => navigate("/host")}>
                                        Open Host Page
                                    </Button>
                                </div>
                            ) : (
                                <div className="meetingModeCard" data-reveal="home" style={{ transitionDelay: "240ms" }}>
                                    <p className="meetingModeOverline">Security</p>
                                    <h3>Share safely</h3>
                                    <p>Share meeting link + password separately and avoid public posting.</p>
                                    <Button variant="outlined" onClick={() => scrollToSection("home-security")}>
                                        View security tips
                                    </Button>
                                </div>
                            )}

                            <div className="meetingModeCard meetingModeCardWide" data-reveal="home" style={{ transitionDelay: "280ms" }}>
                                <p className="meetingModeOverline">Quick Action</p>
                                <h3>Quick Join</h3>
                                <p>Use this for instant join without switching page.</p>
                                <div className="quickJoinBar">
                                    <TextField
                                        size="small"
                                        label="Display Name"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                    />
                                    <TextField
                                        size="small"
                                        label="Meeting Code"
                                        value={quickJoinCode}
                                        onChange={(e) => setQuickJoinCode(e.target.value)}
                                    />
                                    <TextField
                                        size="small"
                                        label="Password"
                                        value={quickJoinPassword}
                                        onChange={(e) => setQuickJoinPassword(e.target.value)}
                                    />
                                    <Button
                                        variant="contained"
                                        onClick={() => handleQuickJoin(quickJoinCode, quickJoinPassword)}
                                    >
                                        Join Now
                                    </Button>
                                </div>
                            </div>

                            <div className="meetingModeCard meetingModeCardWide" data-reveal="home" style={{ transitionDelay: "320ms" }}>
                                <p className="meetingModeOverline">Recent</p>
                                <h3>Recent Meetings</h3>
                                {distinctRecentMeetings.length === 0 ? (
                                    <p>No recent meetings yet.</p>
                                ) : (
                                    <div className="recentMeetingList">
                                        {distinctRecentMeetings.map((meeting) => (
                                            <div key={meeting._id || meeting.meetingCode} className="recentMeetingItem">
                                                <div className="recentMeetingMeta">
                                                    <span>{meeting.meetingCode}</span>
                                                    <small>Last joined: {formatLastJoined(meeting.date)}</small>
                                                </div>
                                                <div className="recentMeetingActions">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => toggleFavorite(meeting.meetingCode)}
                                                    >
                                                        {meeting.isFavorite ? (
                                                            <StarIcon fontSize="small" className="favoriteOn" />
                                                        ) : (
                                                            <StarBorderIcon fontSize="small" className="favoriteOff" />
                                                        )}
                                                    </IconButton>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => handleRejoin(meeting.meetingCode)}
                                                    >
                                                        Rejoin
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                <section id="home-showcase" className="homeSection" data-reveal="home" style={{ transitionDelay: "180ms" }}>
                    <div className="homeSectionHead" data-reveal="home" style={{ transitionDelay: "200ms" }}>
                        <p className="meetingModeOverline">Highlights</p>
                        <h2>Built for real work, not demos</h2>
                        <p className="homeSectionMuted">Clean UI, smooth flows, and secure defaults across the platform.</p>
                    </div>

                    <div className="homeShowcaseGrid">
                        <article className="homeShowcaseCard" data-reveal="home" style={{ transitionDelay: "220ms" }}>
                            <div className="homeShowcaseMedia">
                                <img src="/home-feature-1.avif" alt="Professional meeting experience" loading="lazy" />
                            </div>
                            <div className="homeShowcaseBody">
                                <h3>Professional experience</h3>
                                <p>Consistent theme, fast navigation, and easy onboarding for new users.</p>
                            </div>
                        </article>

                        <article className="homeShowcaseCard" data-reveal="home" style={{ transitionDelay: "260ms" }}>
                            <div className="homeShowcaseMedia">
                                <img src="/mobile.png" alt="HD meeting preview" loading="lazy" />
                            </div>
                            <div className="homeShowcaseBody">
                                <h3>Fast join & HD preview</h3>
                                <p>Join flow stays simple: meeting ID + password. Works smoothly on mobile too.</p>
                            </div>
                        </article>

                        <article className="homeShowcaseCard" data-reveal="home" style={{ transitionDelay: "300ms" }}>
                            <div className="homeShowcaseMedia">
                                <img src="/logo3.png" alt="Zomeetix workspace illustration" loading="lazy" />
                            </div>
                            <div className="homeShowcaseBody">
                                <h3>Secure defaults</h3>
                                <p>OTP only for sign-up, password reset via email, and protected meeting access.</p>
                            </div>
                        </article>
                    </div>
                </section>

                <section id="home-security" className="homeSection homeSectionAlt" data-reveal="home" style={{ transitionDelay: "200ms" }}>
                    <div className="homeSectionHead" data-reveal="home" style={{ transitionDelay: "220ms" }}>
                        <p className="meetingModeOverline">Security</p>
                        <h2>Simple rules that keep meetings safe</h2>
                        <p className="homeSectionMuted">Small habits make a big difference.</p>
                    </div>

                    <div className="homeSecurityGrid">
                        <div className="homeSecurityCard" data-reveal="home" style={{ transitionDelay: "240ms" }}>
                            <h3>Share password separately</h3>
                            <p>Send meeting link in one message and password in another for better control.</p>
                        </div>
                        <div className="homeSecurityCard" data-reveal="home" style={{ transitionDelay: "280ms" }}>
                            <h3>Use Host account for scheduling</h3>
                            <p>Host accounts can schedule meetings and manage reminders with admin policies.</p>
                        </div>
                        <div className="homeSecurityCard" data-reveal="home" style={{ transitionDelay: "320ms" }}>
                            <h3>Keep your session private</h3>
                            <p>Always logout on shared devices. Sessions expire automatically for safety.</p>
                        </div>
                    </div>
                </section>
            </div>

            <Snackbar
                open={Boolean(error)}
                autoHideDuration={3000}
                onClose={() => setError("")}
                message={error}
            />
        </AppShell>
    )
}

export default withAuth(HomeComponent)
