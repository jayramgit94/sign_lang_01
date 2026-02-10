import { Link, useNavigate } from "react-router-dom";
import "../App.css";
export default function LandingPage() {
  const router = useNavigate();

  return (
    <div className="landingPageContainer">
      <nav className="landingNav">
        <div className="landingBrand">
          <div className="brandDot" />
          <h2>Apna Meet</h2>
        </div>
        <div className="landingActions">
          <button
            className="landingButton landingButtonGhost"
            onClick={() => {
              router("/auth");
            }}
          >
            Register
          </button>
          <button
            className="landingButton"
            onClick={() => {
              router("/auth");
            }}
          >
            Sign in
          </button>
          <button
            className="landingButton landingButtonPrimary"
            onClick={() => {
              const randomCode = `room-${Math.random()
                .toString(36)
                .substring(7)}`;
              router(`/${randomCode}`);
            }}
          >
            Join as friend
          </button>
        </div>
      </nav>

      <div className="landingHero">
        <div className="landingContent">
          <div className="landingGlassCard">
            <p className="eyebrow">Trusted video calls</p>
            <h1 className="landingTitle">
              Meet your team in a calm, reliable space.
            </h1>
            <p className="landingSubtitle">
              Apna Meet keeps conversations clear with crisp video, smart
              layout, and fast join links.
            </p>
            <div className="landingCtaRow">
              <Link className="landingButton landingButtonPrimary" to="/auth">
                Get started
              </Link>
              <button
                className="landingButton landingButtonGhost"
                onClick={() => {
                  const randomCode = `room-${Math.random()
                    .toString(36)
                    .substring(7)}`;
                  router(`/${randomCode}`);
                }}
              >
                Join as friend
              </button>
            </div>
          </div>
          <div className="landingStats">
            <div>
              <h3>HD</h3>
              <p>Video quality</p>
            </div>
            <div>
              <h3>Secure</h3>
              <p>Private rooms</p>
            </div>
            <div>
              <h3>Fast</h3>
              <p>Instant join links</p>
            </div>
          </div>
        </div>
        <div className="landingIllustration">
          <img src="/mobile.png" alt="App preview" />
        </div>
      </div>
    </div>
  );
}
