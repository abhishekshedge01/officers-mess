# Officers Mess Management Backend

Node.js + Express + MongoDB native driver backend for the Officers Mess Management system.

## Local MongoDB

The backend is configured for local MongoDB:

```env
MONGO_URI=mongodb://127.0.0.1:27017
DB_NAME=officers-mess
```

Make sure the MongoDB Community Server is running before starting the backend.

## Start

```bash
npm install
npm run dev
```

Or:

```bash
npm start
```

## Create the first admin

```bash
node createAdmin.js
```

Default admin created by the script:

- Email: `admin@officersmess.com`
- Password: `Admin@12345`

Change this password in a real deployment.

## Main API flow

1. `POST /api/auth/login`
2. Admin: `POST /api/admin/messes`
3. Admin: `POST /api/admin/users` to create PMC and USER accounts
4. Admin: `PATCH /api/admin/messes/:messId/pmc`
5. PMC: `PATCH /api/pmc/my-mess/manager`
6. PMC: `PATCH /api/pmc/my-mess/secretary`
7. Manager: `POST /api/rooms`
8. User: `GET /api/messes`
9. User: `GET /api/rooms/available?messId=...&date=YYYY-MM-DD`
10. User: `POST /api/bookings`
11. Manager: approve/reject booking
12. Secretary: approve/reject booking
13. PMC: final approve/reject booking
14. Manager/Secretary: check-in
15. Manager/Secretary: add extra charges during stay
16. Manager/Secretary: check-out and generate final bill
17. User: create a Razorpay payment order for the final bill
18. User: verify Razorpay payment signature and captured payment

There is no booking-token payment. Payment is made only against the final bill generated at checkout.

## Important roles

- `ADMIN`
- `PMC`
- `MESS_MANAGER`
- `MESS_SECRETARY`
- `USER`

## Validation performed on this package

- All JavaScript files pass `node --check`.
- All route modules import successfully and their controller exports were checked against the route contracts.
- The final booking route/controller mismatch was corrected.
- Room status is consistently `ACTIVE` for bookable rooms.
- Booking approval data uses a consistent nested approval structure.
- Extra charges use the same `extraCharges` field from entry through final bill generation.
- MongoDB indexes are created for unique user email, unique room number per mess, unique bill per booking, and common booking/notification queries.

A live MongoDB-backed HTTP test could not be executed inside this development container because the container does not provide the user's local MongoDB server at `127.0.0.1:27017`. Run the supplied backend against the local MongoDB Community Server on the user's machine for the live API test.

## MongoDB persistence

The application uses MongoDB as the source of truth for application data. Users, messes, rooms, bookings, bills/payments, room allocations/blocks, notifications and related operational records are stored through the Express API.

### Authentication session persistence

For project demonstration/audit purposes, every successful login now creates a document in the MongoDB `sessions` collection containing the issued JWT, user ID, role, creation time, expiry time and last-seen time. The same JWT is also stored in the browser as `om_token`, and the user profile is stored locally as `om_user` for the frontend session UI.

Protected API requests require both a valid JWT signature and a matching, unexpired MongoDB session. Logout removes the server-side MongoDB session and clears the browser copy.

> Demo note: storing a raw JWT in MongoDB is intentional for the requested judge demonstration. In a production system, prefer a hashed/opaque session identifier or a server-side session store and avoid storing raw bearer tokens.


## Razorpay setup
Add these values to `backend/.env`:
```env
PAYMENT_MODE=RAZORPAY
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
```
Keep `RAZORPAY_KEY_SECRET` on the server only. Put the Key ID in `frontend/.env` as `VITE_RAZORPAY_KEY_ID`. The Bills page opens Razorpay Standard Checkout with UPI prioritised. The backend verifies the Checkout signature and confirms the payment is captured before changing the bill to `PAID`.
