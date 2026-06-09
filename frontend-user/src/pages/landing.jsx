import React, { useEffect } from "react";
import "../App.css";
import { useNavigate } from "react-router-dom";
import { Button } from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import VideocamIcon from "@mui/icons-material/Videocam";
import LockIcon from "@mui/icons-material/Lock";
import GroupsIcon from "@mui/icons-material/Groups";
import ScheduleIcon from "@mui/icons-material/Schedule";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import RouterOutlinedIcon from "@mui/icons-material/RouterOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";

export default function LandingPage() {
  const router = useNavigate();

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll("[data-reveal]"));
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

  return (
    <div className="landingPageContainer">
      <nav className="landingNav">
        <div className="landingBrandWrap">
          <h2>Zomeetix</h2>
          <p>Secure HD Meetings</p>
        </div>
        <div className="landingNavLinks">
          <button type="button" onClick={() => router("/join")}>
            Join Meeting
          </button>
          <button type="button" onClick={() => router("/auth")}>
            Register
          </button>
          <button type="button" className="landingLoginBtn" onClick={() => router("/auth")}>
            Login
          </button>
        </div>
      </nav>

      <main className="landingMainContainer" data-reveal>
        <section className="landingHeroCopy" data-reveal>
          <p className="landingKicker">One platform for teams and families</p>
          <h1>
            <span>Connect</span> with your team in one click
          </h1>
          <p>
            Zomeetix web meetings with HD video, waiting room, host controls,
            secure invite links, and scheduled sessions.
          </p>

          <div className="landingCTAGroup">
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              onClick={() => router("/auth")}
            >
              Get Started
            </Button>
            <Button variant="outlined" onClick={() => router("/join")}>
              Join Instantly
            </Button>
          </div>

          <div className="landingFeaturePills">
            <span><SecurityIcon fontSize="inherit" /> E2E style security</span>
            <span><VideocamIcon fontSize="inherit" /> HD video quality</span>
            <span><LockIcon fontSize="inherit" /> Host lock controls</span>
          </div>

          <div className="landingMiniStats">
            <article>
              <GroupsIcon fontSize="small" />
              <div>
                <h4>50+</h4>
                <p>Participants</p>
              </div>
            </article>
            <article>
              <ScheduleIcon fontSize="small" />
              <div>
                <h4>Schedule</h4>
                <p>Timed meetings</p>
              </div>
            </article>
            <article>
              <FlashOnIcon fontSize="small" />
              <div>
                <h4>Fast Join</h4>
                <p>Invite + password</p>
              </div>
            </article>
          </div>
        </section>

        <section className="landingHeroVisual" data-reveal>
          <img src="/mobile.png" alt="Zomeetix meeting preview" />
        </section>
      </main>

      <section className="landingSection landingSectionFeatures" data-reveal>
        <div className="landingSectionHead">
          <p className="landingSectionOverline">Why Zomeetix</p>
          <h2>Everything you need for secure meetings</h2>
          <p>Built to feel fast, simple, and professional — for real daily use.</p>
        </div>

        <div className="landingFeatureGrid">
          <article className="landingFeatureCard" data-reveal>
            <ShieldOutlinedIcon className="landingCardIcon" />
            <h3>Secure by default</h3>
            <p>OTP sign-up + password-protected meetings with strong defaults.</p>
          </article>
          <article className="landingFeatureCard" data-reveal>
            <ScheduleIcon className="landingCardIcon" />
            <h3>Host scheduling</h3>
            <p>Create timed meetings with reminders, duration limits, and shareable links.</p>
          </article>
          <article className="landingFeatureCard" data-reveal>
            <RouterOutlinedIcon className="landingCardIcon" />
            <h3>Quick join flow</h3>
            <p>Join instantly with meeting ID + password — no confusing steps.</p>
          </article>
          <article className="landingFeatureCard" data-reveal>
            <AdminPanelSettingsOutlinedIcon className="landingCardIcon" />
            <h3>Admin controls</h3>
            <p>Govern meeting rules, manage activity, and keep platform usage clean.</p>
          </article>
          <article className="landingFeatureCard" data-reveal>
            <VerifiedOutlinedIcon className="landingCardIcon" />
            <h3>Verified access</h3>
            <p>First-time registration is verified via email for account security.</p>
          </article>
          <article className="landingFeatureCard" data-reveal>
            <SupportAgentOutlinedIcon className="landingCardIcon" />
            <h3>Real-world usability</h3>
            <p>Simple UI, consistent theme, and built-in onboarding for new users.</p>
          </article>
        </div>
      </section>

      <section className="landingSection landingSectionAlt landingSectionSplit" data-reveal>
        <div className="landingSplitCopy" data-reveal>
          <p className="landingSectionOverline">How it works</p>
          <h2>Start in minutes</h2>
          <p>Designed to be easy for users, hosts, and admins — without training.</p>

          <div className="landingStepList">
            <div className="landingStepCard" data-reveal>
              <span>1</span>
              <div>
                <h3>Create account</h3>
                <p>Register with OTP verification (only for sign-up).</p>
              </div>
            </div>
            <div className="landingStepCard" data-reveal>
              <span>2</span>
              <div>
                <h3>Host or Join</h3>
                <p>Host accounts can schedule meetings; users can join instantly.</p>
              </div>
            </div>
            <div className="landingStepCard" data-reveal>
              <span>3</span>
              <div>
                <h3>Meet securely</h3>
                <p>Invite link + password keeps access clean and controlled.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="landingSplitVisual" data-reveal>
          <img src="/logo3.png" alt="Zomeetix workspace" />
          <div className="landingSplitGlass">
            <h3>Fast, consistent experience</h3>
            <p>One theme across pages, quick navigation, and profile-based personalization.</p>
          </div>
        </div>
      </section>

      <section className="landingSection landingSectionSecurity" data-reveal>
        <div className="landingSectionHead">
          <p className="landingSectionOverline">Security</p>
          <h2>Trust-focused meeting controls</h2>
          <p>Security is not a toggle — it’s the default behavior.</p>
        </div>

        <div className="landingSecurityGrid">
          <div className="landingSecurityCard" data-reveal>
            <SecurityIcon className="landingCardIcon" />
            <h3>Session tokens</h3>
            <p>Secure sessions with expiry and server-side validation.</p>
          </div>
          <div className="landingSecurityCard" data-reveal>
            <LockIcon className="landingCardIcon" />
            <h3>Meeting passwords</h3>
            <p>Every meeting uses a password — share it separately for safety.</p>
          </div>
          <div className="landingSecurityCard" data-reveal>
            <VideocamIcon className="landingCardIcon" />
            <h3>HD meetings</h3>
            <p>Optimized UI with quality controls for different network speeds.</p>
          </div>
        </div>
      </section>

      <section className="landingSection landingSectionFaq" data-reveal>
        <div className="landingSectionHead">
          <p className="landingSectionOverline">FAQ</p>
          <h2>Common questions</h2>
          <p>Short answers for a smooth onboarding experience.</p>
        </div>

        <div className="landingFaqGrid">
          <details className="landingFaqItem" data-reveal>
            <summary>When does OTP get sent?</summary>
            <p>OTP is sent only during first-time registration. Login uses password only.</p>
          </details>
          <details className="landingFaqItem" data-reveal>
            <summary>How do I create a Host account?</summary>
            <p>On the Sign Up screen, choose account type “Host”. Host accounts can schedule meetings.</p>
          </details>
          <details className="landingFaqItem" data-reveal>
            <summary>What if I forget my password?</summary>
            <p>Use “Forgot password” on the auth page to get a reset link on email.</p>
          </details>
        </div>
      </section>

      <section className="landingSection landingSectionCta" data-reveal>
        <div className="landingCtaInner" data-reveal>
          <div>
            <p className="landingSectionOverline">Get started</p>
            <h2>Ready to run your next meeting?</h2>
            <p>Create an account, set your profile, and meet securely.</p>
          </div>
          <div className="landingCtaButtons">
            <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => router("/auth")}>
              Create Account
            </Button>
            <Button variant="outlined" onClick={() => router("/join")}>
              Join as Guest
            </Button>
          </div>
        </div>
      </section>

      <footer className="landingFooter">
        <div className="landingFooterInner">
          <div className="landingFooterBrand">
            <h3>Zomeetix</h3>
            <p>Secure meetings for teams, families, and communities.</p>
            <div className="landingFooterBadges">
              <span><ShieldOutlinedIcon fontSize="inherit" /> Secure</span>
              <span><ScheduleIcon fontSize="inherit" /> Scheduled</span>
              <span><FlashOnIcon fontSize="inherit" /> Fast</span>
            </div>
          </div>

          <div className="landingFooterCols">
            <div>
              <h4>Product</h4>
              <button type="button" onClick={() => router("/join")}>Join</button>
              <button type="button" onClick={() => router("/auth")}>Register</button>
              <button type="button" onClick={() => router("/auth")}>Login</button>
            </div>
            <div>
              <h4>Platform</h4>
              <button type="button" onClick={() => router("/auth")}>User accounts</button>
              <button type="button" onClick={() => router("/auth")}>Host accounts</button>
              <button type="button" onClick={() => router("/auth")}>Admin access</button>
            </div>
            <div>
              <h4>Support</h4>
              <button type="button">Help Center</button>
              <button type="button">Status</button>
              <button type="button">Contact</button>
            </div>
          </div>
        </div>

        <div className="landingFooterBottom">
          <p>© {new Date().getFullYear()} Zomeetix. All rights reserved.</p>
          <div className="landingFooterLegal">
            <button type="button">Privacy</button>
            <button type="button">Terms</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
