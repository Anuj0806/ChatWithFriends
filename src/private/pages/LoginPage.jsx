import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";

import SocialLogin from "../../components/SocialLogin";
import InputField from "../../components/InputField";

import "../styles/Login.css";

const LoginPage = () => {
  const navigate = useNavigate();
  const { state } = useLocation();

  const [form, setForm] = useState({
    emailOrPhone: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.emailOrPhone || !form.password) {
      setError("Email/Phone and password are required");
      return;
    }

    try {
      setLoading(true);

      // Accounts made via the OTP signup flow live in UserSignup, not the
      // legacy User table - so login goes through LoginController, which
      // checks isVerified and issues the JWT.
      const response = await api.post("/api/login/login-user", {
        username: form.emailOrPhone,
        password: form.password,
      });
      const { token, phone, userName } = response.data;

      localStorage.setItem("authToken", token);
      localStorage.setItem("phone", phone);
      localStorage.setItem("name", userName);

      navigate("/home");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2 className="form-title">Log in with</h2>

      {/* <SocialLogin /> 
      
      <p className="separator"><span>or</span></p> */}

      {state?.justVerified && (
        <p style={{ color: "#25D366", fontSize: 13, textAlign: "center", marginTop: -10, marginBottom: 12 }}>
          Account verified! Check your email for your password.
        </p>
      )}

      <form className="login-form" onSubmit={handleLogin}>
        <InputField
          type="text"
          placeholder="Email or Phone"
          icon="mail"
          name="emailOrPhone"
          value={form.emailOrPhone}
          onChange={inputChange}
        />

        <InputField
          type="password"
          placeholder="Password"
          icon="lock"
          name="password"
          value={form.password}
          onChange={inputChange}
        />

        {error && <p className="error-text">{error}</p>}

        <a href="/forgot-password" className="forgot-password-link">
          Forgot password?
        </a>

        <button className="login-button" disabled={loading}>
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>

      <p className="signup-prompt">
        Don&apos;t have an account?{" "}
        <a href="/signup" className="signup-link">
          Sign up
        </a>
      </p>
    </div>
  );
};

export default LoginPage;
