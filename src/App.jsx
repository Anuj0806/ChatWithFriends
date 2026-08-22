import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./private/pages/LoginPage";
import HomePage from "./private/pages/HomePage";
import SignupPage from "./private/pages/SignupPage";
import VerifyOtpPage from "./private/pages/VerifyOtpPage";
import ForgotPasswordPage from "./private/pages/ForgotPasswordPage";
import PrivateChat from "./private/pages/PrivateChat";

function App() {
  return (
    <Router basename="/ChatWithFriends">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/private-chat" element={<PrivateChat />} />
      </Routes>
    </Router>
  );
}

export default App;