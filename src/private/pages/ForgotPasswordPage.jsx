import React, { useState } from "react";
import api from "../services/api";
import "../styles/ForgotPassword.css";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!emailOrPhone) return setError("Enter email or phone");

    try {
      setLoading(true);
      const res = await api.post("/api/auth/sendEmailOTP", { email: emailOrPhone });
      setPopup(res.data.message || "OTP sent successfully");
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    if (!otp || otp.length !== 6) return setError("Enter 6-digit OTP");

    try {
      setLoading(true);
      const res = await api.post("/api/auth/verify-otp", { email: emailOrPhone, otp });
      setPopup(res.data.message || "OTP verified");
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    if (!newPassword || newPassword.length < 6) return setError("Password must be at least 6 characters");
    if (newPassword !== confirmPassword) return setError("Passwords do not match");

    // Note: a dedicated /api/auth/reset-password endpoint isn't implemented
    // in the backend yet - this UI is wired up and ready for it.
    setPopup("Password reset flow is not fully wired to the backend yet.");
    setStep(1);
    setEmailOrPhone("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        {step === 1 && (
          <>
            <h2 className="forgot-title">Forgot Password</h2>
            <input
              type="text"
              className="forgot-input"
              placeholder="Email"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
            />
            {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
            <button
              className={`forgot-btn ${loading ? "loading" : ""}`}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="forgot-title">Enter OTP</h2>
            <input
              type="text"
              className="forgot-input"
              placeholder="6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
            <button
              className={`forgot-btn ${loading ? "loading" : ""}`}
              onClick={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <p style={{ marginTop: "10px", cursor: "pointer", color: "#25D366" }} onClick={() => setStep(1)}>
              Resend OTP
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="forgot-title">Reset Password</h2>
            <input
              type="password"
              className="forgot-input"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              className="forgot-input"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
            <button
              className={`forgot-btn ${loading ? "loading" : ""}`}
              onClick={handleResetPassword}
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </>
        )}
      </div>

      {popup && (
        <div className="popup">
          <p>{popup}</p>
          <button onClick={() => setPopup(null)}>OK</button>
        </div>
      )}
    </div>
  );
}
