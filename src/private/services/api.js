import axios from "axios";
import { API_HOST, API_PORT } from "../constant/config.js";

const api = axios.create({
  baseURL: `http://${API_HOST}:${API_PORT}`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Automatically attach JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
