// services/api.js
// Axios HTTP client setup with Bearer token interceptor and client-side auth helpers.

import axios from "axios";

// Lightweight global request state used by the premium loading UI.
const loadingListeners = new Set();
let activeRequests = 0;
let activeGetRequests = 0;
let activeMutationRequests = 0;

const emitLoading = () => {
  const state = {
    active: activeRequests,
    gets: activeGetRequests,
    mutations: activeMutationRequests,
  };
  loadingListeners.forEach((listener) => listener(state));
};

export const apiLoading = {
  subscribe(listener) {
    loadingListeners.add(listener);
    listener({ active: activeRequests, gets: activeGetRequests, mutations: activeMutationRequests });
    return () => loadingListeners.delete(listener);
  },
};

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api"
    : "http://localhost:8000/api");

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Automatically inject Bearer token into outgoing requests
api.interceptors.request.use((config) => {
  const method = String(config.method || "get").toLowerCase();
  config.__omRequestType = method === "get" || method === "head" ? "get" : "mutation";
  config.__omStartedAt = Date.now();
  activeRequests += 1;
  if (config.__omRequestType === "get") activeGetRequests += 1;
  else activeMutationRequests += 1;
  emitLoading();

  const token = localStorage.getItem("om_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const finishRequest = (config) => {
  if (!config || config.__omLoadingFinished) return;
  config.__omLoadingFinished = true;
  activeRequests = Math.max(0, activeRequests - 1);
  if (config.__omRequestType === "get") activeGetRequests = Math.max(0, activeGetRequests - 1);
  else activeMutationRequests = Math.max(0, activeMutationRequests - 1);
  emitLoading();
};

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => {
    finishRequest(response.config);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    finishRequest(originalRequest);

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // If the failed request was already the refresh endpoint itself, or login/register, don't loop
      if (
        originalRequest.url?.includes("/auth/refresh") ||
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/register")
      ) {
        auth.clear();
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/register") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      const refreshToken = auth.refreshToken;
      if (!refreshToken) {
        auth.clear();
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/register") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        auth.updateTokens(accessToken, newRefreshToken);

        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        auth.clear();
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/register") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Authentication storage helper for user tokens & profile management.
 */
export const auth = {
  get token() {
    return localStorage.getItem("om_token");
  },

  get refreshToken() {
    return localStorage.getItem("om_refresh_token");
  },

  get user() {
    try {
      return JSON.parse(localStorage.getItem("om_user") || "null");
    } catch {
      return null;
    }
  },

  set(token, user, refreshToken = null) {
    localStorage.setItem("om_token", token);
    if (refreshToken) {
      localStorage.setItem("om_refresh_token", refreshToken);
    }
    if (user) {
      localStorage.setItem("om_user", JSON.stringify(user));
    }
    window.dispatchEvent(new Event("auth-user-updated"));
  },

  updateTokens(token, refreshToken = null) {
    if (token) localStorage.setItem("om_token", token);
    if (refreshToken) localStorage.setItem("om_refresh_token", refreshToken);
    window.dispatchEvent(new Event("auth-user-updated"));
  },

  clear() {
    // Optionally inform backend about logout with refresh token
    const rToken = localStorage.getItem("om_refresh_token");
    if (rToken) {
      try {
        axios.post(`${API_BASE_URL}/auth/logout`, { refreshToken: rToken }, {
          headers: { Authorization: `Bearer ${localStorage.getItem("om_token") || ""}` }
        }).catch(() => {});
      } catch (e) {}
    }

    localStorage.removeItem("om_token");
    localStorage.removeItem("om_refresh_token");
    localStorage.removeItem("om_user");
    window.dispatchEvent(new Event("auth-user-updated"));
  },
};

/**
 * Safely extract human-readable error messages and actionable replies from API response exceptions.
 */
export const errorMessage = (error) => {
  if (!error) return "An unexpected error occurred. Please try again.";

  // Explicit backend error response message
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.response?.data?.error) {
    return typeof error.response.data.error === "string"
      ? error.response.data.error
      : "The request could not be processed by the server.";
  }

  // HTTP status specific explanations
  const status = error.response?.status;
  if (status === 404) {
    return "The requested record, room, or booking was not found on the server (404).";
  }
  if (status === 403) {
    return "Access restricted: You do not have permission or rank privileges for this operation (403).";
  }
  if (status === 400) {
    return "Invalid request submission. Please verify the entered details and try again (400).";
  }
  if (status === 409) {
    return "A scheduling conflict or duplicate entry exists for this record (409).";
  }
  if (status === 500) {
    return "Server internal error (500). The Officers Mess server encountered an error processing your request. Please try again shortly.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "Officers Mess service is temporarily unavailable or undergoing maintenance. Please retry in a few moments.";
  }

  // Network / connectivity issues
  if (
    error.code === "ERR_NETWORK" ||
    error.message === "Network Error" ||
    (!error.response && typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return "Network connection issue: Unable to reach the Officers Mess server. Please check your network connection or verify that the server is online.";
  }

  if (error.code === "ECONNABORTED" || String(error.message).toLowerCase().includes("timeout")) {
    return "Request timed out: The server took too long to reply. Please check your connection and try again.";
  }

  return error.message || "An unexpected error occurred. Please try again.";
};

