import React, { useState } from "react";
import { api, auth, errorMessage } from "../services/api";

import { Page, Card, Field, Alert } from "../components/UI";

export default function Profile() {
  const u = auth.user;

  const [f, setF] = useState({
    name: u?.name || "",
    rank: u?.rank || "",
    serviceId: u?.serviceId || "",
    mobile: u?.mobile || "",
  });

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const save = async (e) => {
    e?.preventDefault?.();
    if (!f.serviceId?.trim()) {
      setErr("Service No is mandatory.");
      return;
    }
    if (!f.rank?.trim()) {
      setErr("Rank is mandatory.");
      return;
    }
    if (!f.name?.trim()) {
      setErr("Name is mandatory.");
      return;
    }
    if (!f.mobile?.trim()) {
      setErr("Mobile number is mandatory.");
      return;
    }

    try {
      setErr("");
      setMsg("");

      const r = await api.patch("/users/profile", f);

      const updatedUser = {
        ...u,
        ...(r.data.user || f),
      };

      auth.set(auth.token, updatedUser);

      setMsg(r.data.message || "Profile updated successfully");
    } catch (e) {
      console.error(e);
      setErr(errorMessage(e));
    }
  };

  return (
    <Page title="Profile" subtitle="Your personal account details.">
      {err && <Alert>{err}</Alert>}

      {msg && <Alert type="success">{msg}</Alert>}

      <Card>
        <form onSubmit={save} style={{ maxWidth: 600 }}>
          <Field
            label="Service No"
            value={f.serviceId}
            required={true}
            placeholder="e.g. 39343K"
            onChange={(v) =>
              setF({
                ...f,
                serviceId: v,
              })
            }
          />

          <Field
            label="Rank"
            value={f.rank}
            required={true}
            onChange={(v) =>
              setF({
                ...f,
                rank: v,
              })
            }
            placeholder="e.g. Wing Commander, Squadron Leader"
          />

          <Field
            label="Name"
            value={f.name}
            required={true}
            placeholder="Officer full name"
            onChange={(v) =>
              setF({
                ...f,
                name: v,
              })
            }
          />

          <Field label="Email" value={u?.email || ""} disabled={true} />

          <Field
            label="Mobile Number"
            value={f.mobile}
            required={true}
            placeholder="10-digit mobile number"
            onChange={(v) =>
              setF({
                ...f,
                mobile: v,
              })
            }
          />

          <button type="submit" className="btn btn-dark">
            <i className="bi bi-check-circle me-2" />
            Save changes
          </button>
        </form>
      </Card>
    </Page>
  );
}
