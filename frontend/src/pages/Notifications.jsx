import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { Page, Card, Empty, Badge } from "../components/UI";

const formatNotificationTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      setLoading(true);

      const response = await api.get("/notifications");

      setItems(response.data?.notifications || []);
    } catch (error) {
      console.error("Unable to load notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);

      setItems((previous) =>
        previous.map((item) =>
          String(item._id) === String(id)
            ? {
                ...item,
                isRead: true,
                readAt: new Date(),
              }
            : item,
        ),
      );
    } catch (error) {
      console.error("Unable to mark notification:", error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");

      setItems((previous) =>
        previous.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt || new Date(),
        })),
      );
    } catch (error) {
      console.error("Unable to mark all notifications:", error);
    }
  };

  const unreadCount = items.filter((item) => !item.isRead).length;

  return (
    <Page
      title="Notifications"
      subtitle="Stay updated with approvals and operations."
      actions={
        unreadCount > 0 ? (
          <button className="btn btn-outline-primary" onClick={markAllRead}>
            <i className="bi bi-check2-all me-2"></i>
            Mark all as read
          </button>
        ) : null
      }
    >
      <Card>
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />

            <div className="mt-3 text-muted">Loading notifications...</div>
          </div>
        ) : !items.length ? (
          <Empty text="No notifications." />
        ) : (
          <div className="notification-list">
            {items.map((notification) => (
              <div
                key={String(notification._id)}
                className={`notification-item ${
                  notification.isRead ? "read" : "unread"
                }`}
                onClick={() =>
                  !notification.isRead && markRead(notification._id)
                }
              >
                <div className="notification-icon">
                  <i className="bi bi-bell-fill"></i>
                </div>

                <div className="notification-content">
                  <div className="notification-top">
                    <b>{notification.title}</b>

                    {!notification.isRead && <Badge type="primary">New</Badge>}
                  </div>

                  <div className="notification-message">
                    {notification.message}
                  </div>

                  <div className="notification-time">
                    <i className="bi bi-clock me-1"></i>

                    {formatNotificationTime(notification.createdAt)}

                    {notification.isRead && notification.readAt && (
                      <span className="ms-3">
                        Read {formatNotificationTime(notification.readAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
