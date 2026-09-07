// pages/AdminBackup.jsx
import React, { useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";
import { Page, Card, Alert, Empty } from "../components/UI";

export default function AdminBackup() {
  const [backups, setBackups] = useState([]);
  const [replicaConfig, setReplicaConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [confirmRestoreName, setConfirmRestoreName] = useState("");

  const loadBackups = async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await api.get("/admin/backups");
      setBackups(res.data.backups || []);
      setReplicaConfig(res.data.replicaConfig || null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setBusyAction("backup");
      setErr("");
      setOk("");
      const res = await api.post("/admin/backups", { reason: "MANUAL_ADMIN_DASHBOARD" });
      setOk(`Snapshot created successfully: ${res.data.backup.filename} (${res.data.backup.totalDocuments} records across ${res.data.backup.totalCollections} collections).`);
      await loadBackups();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusyAction("");
    }
  };

  const handleSyncReplica = async () => {
    if (!window.confirm("Trigger live replication to secondary database now? This ensures exact parity between Primary and Replica.")) {
      return;
    }

    try {
      setBusyAction("replicate");
      setErr("");
      setOk("");
      const res = await api.post("/admin/backups/replicate");
      setOk(
        `Live replication to '${res.data.replication.targetDatabase}' completed successfully. Replicated ${res.data.replication.totalReplicatedDocuments} documents with indexes.`
      );
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusyAction("");
    }
  };

  const executeRestore = async () => {
    if (!restoreTarget) return;

    try {
      setBusyAction("restore");
      setErr("");
      setOk("");
      const res = await api.post("/admin/backups/restore", {
        filename: restoreTarget.filename,
      });
      setOk(`Database successfully restored from snapshot ${restoreTarget.filename}!`);
      setRestoreTarget(null);
      setConfirmRestoreName("");
      await loadBackups();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusyAction("");
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await api.get(`/admin/backups/download/${filename}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setErr("Failed to download backup file.");
    }
  };

  return (
    <Page
      title="Database Replication & Backup Recovery"
      subtitle="Manage point-in-time database snapshots, replica database synchronization, and disaster recovery"
    >
      {err && (
        <Alert variant="danger" onClose={() => setErr("")}>
          <i className="bi bi-exclamation-triangle-fill me-2" />
          {err}
        </Alert>
      )}

      {ok && (
        <Alert variant="success" onClose={() => setOk("")}>
          <i className="bi bi-check-circle-fill me-2" />
          {ok}
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card shadow-sm border-0 h-100 p-3 bg-light">
            <div className="d-flex align-items-center">
              <div
                className="rounded-3 p-3 text-white me-3"
                style={{ backgroundColor: "#0f3460" }}
              >
                <i className="bi bi-hdd-stack fs-3" />
              </div>
              <div>
                <div className="text-muted small fw-semibold text-uppercase">
                  Available Snapshots
                </div>
                <div className="fs-3 fw-bold">{backups.length}</div>
                <div className="small text-muted">Point-in-time archives</div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card shadow-sm border-0 h-100 p-3 bg-light">
            <div className="d-flex align-items-center">
              <div
                className="rounded-3 p-3 text-white me-3"
                style={{ backgroundColor: "#1b4d3e" }}
              >
                <i className="bi bi-arrow-repeat fs-3" />
              </div>
              <div>
                <div className="text-muted small fw-semibold text-uppercase">
                  Replica Target
                </div>
                <div className="fs-5 fw-bold text-truncate" style={{ maxWidth: "200px" }}>
                  {replicaConfig?.replicaDbName || "officers-mess-replica"}
                </div>
                <div className="small text-success">
                  <i className="bi bi-shield-check me-1" /> Active Standby Mirror
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card shadow-sm border-0 h-100 p-3 bg-light">
            <div className="d-flex align-items-center">
              <div
                className="rounded-3 p-3 text-white me-3"
                style={{ backgroundColor: "#533483" }}
              >
                <i className="bi bi-clock-history fs-3" />
              </div>
              <div>
                <div className="text-muted small fw-semibold text-uppercase">
                  Automated Schedule
                </div>
                <div className="fs-5 fw-bold">
                  {replicaConfig?.autoBackupEnabled ? `Every ${replicaConfig.intervalHours}h` : "Disabled"}
                </div>
                <div className="small text-muted">Continuous background protection</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Actions Bar */}
      <Card className="mb-4 shadow-sm border-0">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <h5 className="mb-1 fw-bold">
              <i className="bi bi-shield-lock me-2 text-primary" />
              Operational Controls
            </h5>
            <p className="text-muted small mb-0">
              Create an instant snapshot or synchronize the standby replica database immediately.
            </p>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              className="btn btn-outline-secondary d-flex align-items-center gap-2"
              onClick={loadBackups}
              disabled={loading || !!busyAction}
            >
              <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} />
              Refresh
            </button>

            <button
              className="btn btn-outline-success d-flex align-items-center gap-2"
              onClick={handleSyncReplica}
              disabled={!!busyAction}
            >
              {busyAction === "replicate" ? (
                <>
                  <span className="spinner-border spinner-border-sm" />
                  Synchronizing Replica…
                </>
              ) : (
                <>
                  <i className="bi bi-arrow-left-right" />
                  Sync to Replica DB
                </>
              )}
            </button>

            <button
              className="btn btn-primary d-flex align-items-center gap-2"
              onClick={handleCreateBackup}
              disabled={!!busyAction}
            >
              {busyAction === "backup" ? (
                <>
                  <span className="spinner-border spinner-border-sm" />
                  Generating Snapshot…
                </>
              ) : (
                <>
                  <i className="bi bi-cloud-arrow-up-fill" />
                  Create Snapshot Now
                </>
              )}
            </button>
          </div>
        </div>
      </Card>

      {/* Backups List Table */}
      <Card className="shadow-sm border-0">
        <h5 className="fw-bold mb-3">
          <i className="bi bi-archive me-2 text-secondary" />
          Point-in-Time Database Snapshots
        </h5>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />
            <div className="mt-2 text-muted">Scanning backup directory…</div>
          </div>
        ) : backups.length === 0 ? (
          <Empty message="No backups found. Click 'Create Snapshot Now' to create your first database archive." />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Archive File</th>
                  <th>Created At</th>
                  <th>Size</th>
                  <th>Collections</th>
                  <th>Documents</th>
                  <th>Trigger Reason</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename}>
                    <td>
                      <div className="fw-semibold font-monospace text-primary">
                        <i className="bi bi-file-earmark-code me-2" />
                        {b.filename}
                      </div>
                    </td>
                    <td>
                      <div className="small">{new Date(b.createdAt).toLocaleString("en-IN")}</div>
                    </td>
                    <td>
                      <span className="badge bg-light text-dark border">
                        {b.sizeKB} KB
                      </span>
                    </td>
                    <td>
                      <span className="badge bg-info-subtle text-info-emphasis">
                        {b.totalCollections} Collections
                      </span>
                    </td>
                    <td>
                      <span className="badge bg-secondary-subtle text-secondary-emphasis">
                        {b.totalDocuments} Docs
                      </span>
                    </td>
                    <td>
                      <span className="small text-muted d-block">{b.reason || "MANUAL"}</span>
                      {b.dataHash && (
                        <span
                          className="badge bg-success-subtle text-success-emphasis font-monospace"
                          style={{ fontSize: "0.7rem" }}
                          title={`SHA-256 Hash: ${b.dataHash}`}
                        >
                          <i className="bi bi-shield-check me-1" />
                          SHA-256: {b.dataHash.slice(0, 8)}...{b.dataHash.slice(-6)}
                        </span>
                      )}
                    </td>
                    <td className="text-end">
                      <div className="btn-group btn-group-sm">
                        <button
                          className="btn btn-outline-secondary"
                          title="Download Snapshot"
                          onClick={() => handleDownload(b.filename)}
                        >
                          <i className="bi bi-download" />
                        </button>
                        <button
                          className="btn btn-outline-danger"
                          title="Restore this backup"
                          onClick={() => setRestoreTarget(b)}
                        >
                          <i className="bi bi-clock-history me-1" />
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Confirmation Modal for Restore */}
      {restoreTarget && (
        <div
          className="modal d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle-fill me-2" />
                  Confirm Database Restore
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setRestoreTarget(null)}
                />
              </div>
              <div className="modal-body">
                <p className="fw-semibold text-danger">
                  WARNING: Restoring will overwrite the current database collections with the data from this archive.
                </p>
                <div className="p-3 bg-light rounded border mb-3">
                  <div>
                    <strong>Snapshot:</strong> {restoreTarget.filename}
                  </div>
                  <div>
                    <strong>Created:</strong> {new Date(restoreTarget.createdAt).toLocaleString("en-IN")}
                  </div>
                  <div>
                    <strong>Records:</strong> {restoreTarget.totalDocuments} documents
                  </div>
                </div>
                <p className="small text-muted mb-2">
                  To prevent accidental restoration, please type <strong>RESTORE</strong> below to proceed:
                </p>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Type RESTORE to confirm"
                  value={confirmRestoreName}
                  onChange={(e) => setConfirmRestoreName(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRestoreTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={confirmRestoreName !== "RESTORE" || busyAction === "restore"}
                  onClick={executeRestore}
                >
                  {busyAction === "restore" ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Restoring Database…
                    </>
                  ) : (
                    "Confirm Overwrite & Restore"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
