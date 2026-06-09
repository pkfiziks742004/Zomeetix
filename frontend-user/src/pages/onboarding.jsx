import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Chip, FormControlLabel, Radio, RadioGroup, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import withAuth from "../utils/withAuth";

const ONBOARDING_STEPS = [
    "Profile Setup",
    "Device Check",
    "Ready to Start",
];

function OnboardingPage() {
    const navigate = useNavigate();
    const { userData, completeUserOnboarding, handleLogout, hasCompletedOnboarding, updateMe } = useContext(AuthContext);

    const videoRef = useRef(null);
    const streamRef = useRef(null);

    const [step, setStep] = useState(0);
    const [displayName, setDisplayName] = useState(
        () => localStorage.getItem("meeting_display_name") || userData?.name || userData?.username || ""
    );
    const [organizationName, setOrganizationName] = useState(() => localStorage.getItem("org_name") || "");
    const [workRole, setWorkRole] = useState(() => localStorage.getItem("work_role") || "Team Member");
    const [cameraMode, setCameraMode] = useState(() => localStorage.getItem("default_media_camera") || "enabled");
    const [joinMode, setJoinMode] = useState(() => localStorage.getItem("default_join_mode") || "ask");

    const [cameraStatus, setCameraStatus] = useState("idle");
    const [micStatus, setMicStatus] = useState("idle");
    const [deviceError, setDeviceError] = useState("");
    const [profileSaveError, setProfileSaveError] = useState("");

    const isProfileValid = useMemo(() => {
        return displayName.trim().length >= 2 && organizationName.trim().length >= 2;
    }, [displayName, organizationName]);

    const progressWidth = `${((step + 1) / ONBOARDING_STEPS.length) * 100}%`;

    useEffect(() => {
        if (hasCompletedOnboarding) {
            navigate("/home");
        }
    }, [hasCompletedOnboarding, navigate]);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, []);

    const releaseCurrentStream = () => {
        if (!streamRef.current) return;
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const startDevicePreview = async () => {
        setDeviceError("");
        setCameraStatus("requesting");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: cameraMode === "enabled",
                audio: true,
            });

            releaseCurrentStream();
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
            }

            setCameraStatus(cameraMode === "enabled" ? "granted" : "skipped");
            setMicStatus("granted");
        } catch (error) {
            setCameraStatus("blocked");
            setMicStatus("blocked");
            setDeviceError(error?.message || "Unable to access camera/microphone.");
        }
    };

    const runMicTest = async () => {
        setDeviceError("");
        setMicStatus("requesting");

        try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            micStream.getTracks().forEach((track) => track.stop());
            setMicStatus("granted");
        } catch (error) {
            setMicStatus("blocked");
            setDeviceError(error?.message || "Microphone permission denied.");
        }
    };

    const goNextStep = () => {
        if (step === 0 && !isProfileValid) {
            return;
        }
        if (step < ONBOARDING_STEPS.length - 1) {
            setStep((prev) => prev + 1);
        }
    };

    const goPreviousStep = () => {
        if (step > 0) {
            setStep((prev) => prev - 1);
        }
    };

    const handleFinish = async () => {
        if (!isProfileValid) {
            setStep(0);
            return;
        }

        localStorage.setItem("meeting_display_name", displayName.trim());
        localStorage.setItem("org_name", organizationName.trim());
        localStorage.setItem("work_role", workRole);
        localStorage.setItem("default_media_camera", cameraMode);
        localStorage.setItem("default_join_mode", joinMode);

        releaseCurrentStream();

        setProfileSaveError("");
        try {
            await updateMe({
                displayName: displayName.trim(),
                organization: organizationName.trim(),
                workRole: workRole,
            });
        } catch (error) {
            setProfileSaveError(
                error?.response?.data?.message ||
                "Profile saved locally, but server profile update failed. You can retry from Profile page."
            );
        }

        completeUserOnboarding();
        navigate("/home");
    };

    return (
        <div className="onboardingPage">
            <div className="onboardingShell">
                <aside className="onboardingVisual">
                    <p className="onboardingBadge">FIRST-TIME SETUP</p>
                    <h1>Welcome to Zomeetix Workspace</h1>
                    <p>
                        Configure your workspace once. Next time login se direct home open hoga.
                    </p>
                    <img src="/logo3.png" alt="Video meeting setup" />
                </aside>

                <section className="onboardingCard">
                    <p className="onboardingKicker">Step {step + 1} of {ONBOARDING_STEPS.length}</p>
                    <h2>{ONBOARDING_STEPS[step]}</h2>

                    <div className="onboardingProgressTrack">
                        <span style={{ width: progressWidth }} />
                    </div>

                    {step === 0 && (
                        <>
                            <div className="onboardingFieldBlock">
                                <TextField
                                    fullWidth
                                    label="Display name"
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    helperText="Meeting tile me ye name dikhega"
                                />
                            </div>

                            <div className="onboardingFieldBlock">
                                <TextField
                                    fullWidth
                                    label="Organization"
                                    value={organizationName}
                                    onChange={(event) => setOrganizationName(event.target.value)}
                                    helperText="Company/School/Team name"
                                />
                            </div>

                            <div className="onboardingFieldBlock">
                                <TextField
                                    fullWidth
                                    label="Role"
                                    value={workRole}
                                    onChange={(event) => setWorkRole(event.target.value)}
                                    helperText="Example: Teacher, Manager, Developer"
                                />
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <div className="onboardingFieldBlock">
                                <h3>Camera preference</h3>
                                <RadioGroup value={cameraMode} onChange={(event) => setCameraMode(event.target.value)}>
                                    <FormControlLabel value="enabled" control={<Radio />} label="Start with camera on" />
                                    <FormControlLabel value="disabled" control={<Radio />} label="Start with camera off" />
                                </RadioGroup>
                            </div>

                            <div className="onboardingFieldBlock">
                                <h3>Live preview</h3>
                                <div className="onboardingDevicePreview">
                                    <video ref={videoRef} muted playsInline autoPlay />
                                    {cameraStatus !== "granted" && <p>Click "Start Device Check" to preview your setup.</p>}
                                </div>
                                <div className="onboardingDeviceActions">
                                    <Button variant="contained" onClick={startDevicePreview}>Start Device Check</Button>
                                    <Button variant="outlined" onClick={runMicTest}>Test Microphone</Button>
                                    <Button variant="text" onClick={releaseCurrentStream}>Stop Preview</Button>
                                </div>
                                <div className="onboardingStatusRow">
                                    <Chip label={`Camera: ${cameraStatus}`} size="small" />
                                    <Chip label={`Mic: ${micStatus}`} size="small" />
                                </div>
                                {deviceError ? <Alert severity="warning">{deviceError}</Alert> : null}
                            </div>

                            <div className="onboardingFieldBlock">
                                <h3>Meeting entry behavior</h3>
                                <RadioGroup value={joinMode} onChange={(event) => setJoinMode(event.target.value)}>
                                    <FormControlLabel value="ask" control={<Radio />} label="Always ask before joining" />
                                    <FormControlLabel value="direct" control={<Radio />} label="Join directly with saved defaults" />
                                </RadioGroup>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <div className="onboardingSummaryGrid">
                            <div className="onboardingSummaryItem">
                                <h4>Profile</h4>
                                <p>{displayName || "-"}</p>
                            </div>
                            <div className="onboardingSummaryItem">
                                <h4>Organization</h4>
                                <p>{organizationName || "-"}</p>
                            </div>
                            <div className="onboardingSummaryItem">
                                <h4>Role</h4>
                                <p>{workRole || "-"}</p>
                            </div>
                            <div className="onboardingSummaryItem">
                                <h4>Camera</h4>
                                <p>{cameraMode === "enabled" ? "On by default" : "Off by default"}</p>
                            </div>
                            <div className="onboardingSummaryItem">
                                <h4>Join Mode</h4>
                                <p>{joinMode === "ask" ? "Ask before join" : "Direct join"}</p>
                            </div>
                        </div>
                    )}

                    <div className="onboardingActions">
                        <Button variant="text" onClick={handleLogout}>Sign out</Button>
                        <div className="onboardingActionGroup">
                            <Button variant="outlined" disabled={step === 0} onClick={goPreviousStep}>Back</Button>
                            {step < ONBOARDING_STEPS.length - 1 ? (
                                <Button variant="contained" disabled={step === 0 && !isProfileValid} onClick={goNextStep}>
                                    Continue
                                </Button>
                            ) : (
                                <Button variant="contained" onClick={handleFinish}>Enter Workspace</Button>
                            )}
                        </div>
                    </div>
                    {profileSaveError ? <Alert severity="warning">{profileSaveError}</Alert> : null}
                </section>
            </div>
        </div>
    );
}

export default withAuth(OnboardingPage);
