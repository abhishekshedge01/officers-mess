// components/Protected.jsx
// Route wrapper that guards pages based on authentication token and allowed user roles.

import React from "react";
import { Navigate } from "react-router-dom";
import { auth } from "../services/api";

export default function Protected({ children, roles }) {
  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(auth.user?.role)) {
    return <Navigate to="/error?type=403" replace />;
  }

  return children;
}
