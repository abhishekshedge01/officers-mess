// pages/Password.jsx
// Form to update the user password according to role-specific API endpoints.

import React, { useState } from "react";
import { api, auth, errorMessage } from "../services/api";
import { Page, Card, Field, Alert } from "../components/UI";

export default function Password() {
  const user = auth.user;

  // Resolve target endpoint according to user role
  const path =
    user?.role === "PMC"
      ? "/pmc/password"
      : user?.role === "MESS_MANAGER"
        ? "/manager/password"
        : user?.role === "MESS_SECRETARY"
          ? "/secretary/password"
          : "/users/password";

  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    setMessage("");
    try {
      const response = await api.patch(path, form);
      setMessage(response.data.message || "Password changed successfully");
      setForm({ currentPassword: "", newPassword: "" });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Page title="Change password" subtitle="Keep your account secure.">
      {error && <Alert>{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      <Card>
        <div style={{ maxWidth: 550 }}>
          <Field
            label="Current password"
            type="password"
            value={form.currentPassword}
            onChange={(v) => setForm({ ...form, currentPassword: v })}
          />
          <Field
            label="New password"
            type="password"
            value={form.newPassword}
            onChange={(v) => setForm({ ...form, newPassword: v })}
          />
          <button className="btn btn-dark" onClick={save}>
            Change password
          </button>
        </div>
      </Card>
    </Page>
  );
}
