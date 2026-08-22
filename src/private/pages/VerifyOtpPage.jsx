import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import "../styles/ForgotPassword.css";

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const { state } = useLocation();

  // Signup hands the email off via router state. If someone lands here
  // directly (refresh, bookmarked link) there's no email to verify -
  // send them back to sign up rather than showing a broken form.
  const [email] = useState(state?.email || "");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (!state?.email) {
    return (
      <div className="forgot-container">
        <div className="forgot-card">
          <h2 className="forgot-title">Verify your email</h2>
          <p style={{ fontSize: 14, color: "#666" }}>
            We don't have an email to verify. Please sign up first.
          </p>
          <button className="forgot-btn" onClick={() => navigate("/signup")}>
            Go to Sign Up
          </button>
        </div>
      </div>
    );
  }

  const handleVerify = async () => {
    setError("");
    setInfo("");

    if (!otp.trim() || otp.trim().length !== 6) {
      return setError("Enter the 6-digit code from your email");
    }

    try {
      setLoading(true);
      await api.post("/api/auth/verify-otp", { email, otp: otp.trim() });
      navigate("/", { state: { justVerified: true } });
    } catch (err) {
      setError(err.response?.data?.message || "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");

    try {
      setResending(true);
      const res = await api.post("/api/auth/sendEmailOTP", { email });
      setInfo(res.data?.message || "A new code has been sent");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't resend the code");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        <h2 className="forgot-title">Verify your email</h2>
        <p style={{ fontSize: 14, color: "#666", marginTop: -10 }}>
          We sent a 6-digit code to <strong>{email}</strong>
        </p>

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          className="forgot-input"
          placeholder="6-digit code"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        />

        {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
        {info && <p style={{ color: "#25D366", fontSize: 13 }}>{info}</p>}

        <button className={`forgot-btn ${loading ? "loading" : ""}`} onClick={handleVerify} disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </button>

        <p className="resend-otp" onClick={!resending ? handleResend : undefined}>
          {resending ? "Sending..." : "Resend code"}
        </p>
      </div>
    </div>
  );
}
