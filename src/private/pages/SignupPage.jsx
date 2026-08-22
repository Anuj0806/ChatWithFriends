import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import InputField from "../../components/signInputField";
import "../styles/SignUp.css";

export default function SignUpPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    city: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");

  const inputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const validateForm = () => {
    let temp = {};

    if (!form.name.trim()) temp.name = "Full name is required";

    if (!form.email.trim()) temp.email = "Email is required";
    else if (!form.email.includes("@")) temp.email = "Enter a valid email";

    if (!form.phoneNumber.trim()) temp.phoneNumber = "Phone number is required";

    if (!form.city.trim()) temp.city = "City is required";

    if (!form.password.trim()) temp.password = "Password is required";
    else if (form.password.length < 6) temp.password = "Password must be at least 6 characters";

    if (!form.confirmPassword.trim()) temp.confirmPassword = "Confirm your password";
    else if (form.password !== form.confirmPassword) temp.confirmPassword = "Passwords do not match";

    setErrors(temp);
    return Object.keys(temp).length === 0;
  };

  const handleSignup = async () => {
    setServerError("");
    if (!validateForm()) return;

    setLoading(true);

    try {
      // confirmPassword never leaves the browser - the backend
      // (UserSignupRequest) only has a single "password" field.
      const { confirmPassword, ...payload } = form;
      void confirmPassword;

      await api.post("/api/auth/signup", payload);

      // Account now exists but is unverified. Hand off to the OTP screen
      // with the email so it knows who it's verifying.
      navigate("/verify-otp", { state: { email: form.email } });
    } catch (err) {
      setServerError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <h2 className="signup-title">Create Account</h2>

        <div className="input-group">
          <InputField
            type="text"
            placeholder="Full Name"
            icon="person"
            name="name"
            value={form.name}
            onChange={inputChange}
            error={errors.name}
          />

          <InputField
            type="email"
            placeholder="Email"
            icon="mail"
            name="email"
            value={form.email}
            onChange={inputChange}
            error={errors.email}
          />

          <InputField
            type="text"
            placeholder="Phone"
            icon="call"
            name="phoneNumber"
            value={form.phoneNumber}
            onChange={inputChange}
            error={errors.phoneNumber}
          />

          <InputField
            type="text"
            placeholder="City"
            icon="location_city"
            name="city"
            value={form.city}
            onChange={inputChange}
            error={errors.city}
          />

          <InputField
            type="password"
            placeholder="Password"
            icon="lock"
            name="password"
            value={form.password}
            onChange={inputChange}
            error={errors.password}
          />

          <InputField
            type="password"
            placeholder="Confirm Password"
            icon="lock"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={inputChange}
            error={errors.confirmPassword}
          />
        </div>

        <p style={{ fontSize: 13, color: "#666", margin: "4px 0" }}>
          We'll email you a 6-digit code to verify your account before you can log in.
        </p>

        {serverError && <p className="error-text">{serverError}</p>}

        <button
          className={`signup-btn ${loading ? "loading" : ""}`}
          disabled={loading}
          onClick={handleSignup}
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>

        <div className="signup-links">
          <span onClick={() => navigate("/")}>Already have an account? Login</span>
        </div>
      </div>
    </div>
  );
}
