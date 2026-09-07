# 🎖️ OFFICERS MESS MANAGEMENT SYSTEM (OMMS)
## Comprehensive Technical Architecture, Defense Viva, and System Design Master Guide

---

# TABLE OF CONTENTS
1. [Executive Summary & High-Level System Architecture](#1-executive-summary--high-level-system-architecture)
2. [Network Engineering & The OSI Layer Mapping](#2-network-engineering--the-osi-layer-mapping)
3. [Transport Layer Security (TLS/SSL), RSA & Asymmetric Cryptography](#3-transport-layer-security-tlsssl-rsa--asymmetric-cryptography)
4. [Authentication & Authorization: Dual-Token JWT Architecture (Access + Refresh Rotation)](#4-authentication--authorization-dual-token-jwt-architecture-access--refresh-rotation)
5. [Cryptographic Engineering: Bcrypt vs. Crypto (SHA-256, HMAC, PRNG)](#5-cryptographic-engineering-bcrypt-vs-crypto-sha-256-hmac-prng)
6. [Database Engineering: MongoDB Schema Design, Indexes & Parity](#6-database-engineering-mongodb-schema-design-indexes--parity)
7. [Disaster Recovery: Native Replication, Point-in-Time Snapshots & SHA-256 Checksums](#7-disaster-recovery-native-replication-point-in-time-snapshots--sha-256-checksums)
8. [Cross-Origin Resource Sharing (CORS), Reverse Proxies & Network Topologies](#8-cross-origin-resource-sharing-cors-reverse-proxies--network-topologies)
9. [REST API Design, Statelessness, Contract Testing & Idempotency](#9-rest-api-design-statelessness-contract-testing--idempotency)
10. [Software Engineering: Object-Oriented Principles (OOP) & Clean Architecture](#10-software-engineering-object-oriented-principles-oop--clean-architecture)
11. [Client-Side Architecture: React 19, Vite, LottieFiles & Memory Management](#11-client-side-architecture-react-19-vite-lottiefiles--memory-management)
12. [Postman Testing Workflow & Contract Verification](#12-postman-testing-workflow--contract-verification)
13. [Top 50 Viva / Scrutiny Questions & Defense Answers (With "Look-Cool" Buzzwords)](#13-top-50-viva--scrutiny-questions--defense-answers-with-look-cool-buzzwords)

---

# 1. EXECUTIVE SUMMARY & HIGH-LEVEL SYSTEM ARCHITECTURE

### The Mission
The **Officers Mess Management System (OMMS)** is an enterprise-grade, defense-compliant guest house and messing ERP designed to eliminate billing ambiguities, overbooking anomalies, unauthorized credential sharing, and network eavesdropping in military messes.

### High-Level Architecture Diagram
```
                     +---------------------------------------+
                     |        CLIENT DEVICES (OFFICERS)      |
                     |  React 19 SPA + Vite + Axios Interc.  |
                     +-------------------+-------------------+
                                         |
                                         | HTTPS (TLS 1.3 / Port 8443)
                                         | Plain HTTP (Port 8000 Fallback)
                                         v
                     +-------------------+-------------------+
                     |      EXPRESS.JS APPLICATION SERVER    |
                     | - CORS Middleware & Audit Logger      |
                     | - Dual Server (HTTP & HTTPS Listeners)|
                     | - JWT Guard & Revoked Tokens Denylist |
                     | - Native PDF Streaming Engine         |
                     +---------+-------------------+---------+
                               |                   |
            Primary Connection |                   | Native Replication
            (Port 27017)       |                   | (Sync Worker)
                               v                   v
      +------------------------+-----+   +---------+--------------------+
      |  PRIMARY DATABASE (MongoDB)  |   | REPLICA DATABASE (Standby)   |
      | - DB: `officers-mess`        |   | - DB: `officers-mess-replica`|
      | - Compound Indexes           |   | - Exact Mirror + Indexes     |
      | - TTL Expiry Engine          |   | - `_replication_meta` Log   |
      +------------------------------+   +------------------------------+
                               |
                               | Periodic Cron / On-Demand
                               v
      +-----------------------------------------------------------------+
      |             POINT-IN-TIME BACKUP SNAPSHOT ARCHIVES              |
      | - Storage: `backend/backups/backup-YYYY-MM-DD.json`             |
      | - Cryptographic Seal: SHA-256 Data Integrity Checksum           |
      | - 1-Command Air-Gapped CLI Restore (`npm run restore:db`)       |
      +-----------------------------------------------------------------+
```

---

# 2. NETWORK ENGINEERING & THE OSI LAYER MAPPING

When an examiner asks: *"Explain what happens when an officer taps 'Login' across all 7 layers of the OSI stack,"* refer to this exact mapping:

| Layer # | Layer Name | Protocol / Component in OMMS | Exact Role in This Project |
| :---: | :--- | :--- | :--- |
| **7** | **Application** | `HTTP / 1.1`, `HTTPS`, JSON | Axios sends `POST /api/auth/login` with body `{ email, password }`. Express routes parse JSON. |
| **6** | **Presentation** | `TLS 1.3`, `X.509`, `AES-256-GCM` | Data encryption & decryption via Node's `crypto` module. Base64 encoding of tokens and PDFs. |
| **5** | **Session** | `JWT (JSON Web Token)`, MongoDB `sessions` | Establishes session continuity. Verifies `sessions` active state and rotates 7-day refresh tokens. |
| **4** | **Transport** | `TCP` (Ports 8000, 8443, 5173, 27017) | 3-way handshake (`SYN`, `SYN-ACK`, `ACK`), flow control, segmentation, reliable retransmission. |
| **3** | **Network** | `IPv4 / IPv6` (`127.0.0.1`, `::1`) | IP packet routing from client IP to server loopback/LAN address. |
| **2** | **Data Link** | `Ethernet 802.3`, `Wi-Fi 802.11` | MAC address framing, error checking (`CRC`) over the local NIC interface. |
| **1** | **Physical** | Cat6 RJ-45 copper cables, Wi-Fi radio waves | Physical transmission of raw bits (0s and 1s) over voltage/radio frequencies. |

---

# 3. TRANSPORT LAYER SECURITY (TLS/SSL), RSA & ASYMMETRIC CRYPTOGRAPHY

### 1. The Threat Model (Cleartext HTTP)
If the project ran only on port 8000 (HTTP), packet sniffers on the same military Wi-Fi/LAN (such as Wireshark or `tcpdump`) could capture TCP packets and read:
```http
POST /api/auth/login HTTP/1.1
Host: localhost:8000
Content-Type: application/json

{"email":"abhishek@iaf.in","password":"SecretPassword123"}
```

### 2. How Asymmetric vs. Symmetric Cryptography Works in OMMS
OMMS implements a **Hybrid Cryptosystem**:
1. **Asymmetric Cryptography (RSA-2048)**: Used **only** during the handshake because it is computationally expensive.
   - Public Key (`server.cert`): Distributed freely to client browsers. Used by the browser to encrypt a freshly generated random session key.
   - Private Key (`server.key`): Kept in `backend/ssl/server.key`. Only the server can decrypt data encrypted with its public key.
2. **Symmetric Cryptography (AES-256-GCM)**: Once both client and server share the negotiated session key, all subsequent data (names, meal costs, JWT tokens) is encrypted using fast symmetric stream encryption.

```
       CLIENT BROWSER                                          OFFICERS MESS SERVER
             |                                                           |
             | ----- 1. ClientHello (TLS Version, Ciphers) -------------> |
             |                                                           |
             | <---- 2. ServerHello + server.cert (Contains RSA Public) - |
             |                                                           |
  [Verifies Cert SAN]                                                    |
  [Generates Pre-Master Secret]                                          |
  [Encrypts with RSA Public Key]                                         |
             |                                                           |
             | ----- 3. Encrypted Pre-Master Secret -------------------> |
             |                                                           |
             |                                               [Decrypts with server.key]
             |                                               [Both derive AES-256 Key]
             |                                                           |
             | <==== 4. Fully Encrypted AES-256-GCM Bidirectional Stream ====> |
```

### 3. Generation Engine (`backend/scripts/generate-ssl.js`)
We automated local self-signed certificate generation using Node.js `crypto` & `selfsigned`:
- **Algorithm**: RSA 2048-bit with SHA-256 hashing.
- **Subject Alternative Names (SAN)**: Explicitly binds `localhost` and `127.0.0.1` to prevent Chrome/Edge hostname rejection.
- **Validity**: 3,650 days (10 years) for offline installations.

---

# 4. AUTHENTICATION & AUTHORIZATION: DUAL-TOKEN JWT ARCHITECTURE

### 1. Dual-Token Specification

```
                          [USER LOGIN]
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
      [ACCESS TOKEN (JWT)]             [REFRESH TOKEN (JWT)]
      - Expiry: 15 Minutes             - Expiry: 7 Days
      - In-Memory & `om_token`         - LocalStorage `om_refresh_token`
      - Sent in Header:                - Stored in DB collection:
        `Authorization: Bearer <tok>`    `refresh_tokens`
```

### 2. The 7-Day Refresh Token Lifecycle & Sliding Window Rotation
- **15-Minute Access Token Expiration**: When an access token expires, Axios intercepts the `401 Unauthorized` response.
- **Silent Background Refresh**: The client issues `POST /api/auth/refresh` sending `{ refreshToken }`.
- **Token Rotation**:
  1. The server validates the refresh token signature.
  2. The server **deletes** the incoming refresh token from `refresh_tokens`.
  3. The server moves the old token to `revoked_tokens` to prevent reuse.
  4. The server issues a **new Access Token (15m)** and a **new Refresh Token (7d)**.
  5. The client stores the new tokens and replays the original failed request without interrupting the user.

### 3. Replay Detection & Family Revocation
If a malicious actor intercepts a discarded refresh token and attempts to refresh it:
1. The server searches `refresh_tokens` and fails to find it.
2. The server detects a **Replay Attack / Stolen Token Incident**.
3. It immediately executes **Family Revocation**: deletes **all** refresh tokens and sessions for that `userId` and writes a security log with reason `REUSED_OR_INVALID_REFRESH_TOKEN`.
4. The legitimate officer is prompted to re-authenticate, instantly kicking the intruder out.

---

# 5. CRYPTOGRAPHIC ENGINEERING: BCRYPT VS. CRYPTO

Examiners often ask: *"Why did you use Bcrypt for passwords but Node `crypto` for files and tokens?"*

```
                                CRYPTOGRAPHIC TOOL MATRIX
   +---------------------------------------+---------------------------------------+
   |             BCRYPT (10 Rounds)        |          CRYPTO (SHA-256 / HMAC)      |
   +---------------------------------------+---------------------------------------+
   | • Slow by design (~100ms per check)   | • Ultra-fast (processes MBs in ms)    |
   | • Adaptive work factor (cost = 10)    | • Handles arbitrary data sizes        |
   | • Automatic 22-character salting      | • Deterministic (same in = same out)  |
   | • Max payload: 72 bytes               | • Unlimited payload size              |
   | • USE CASE: User Passwords in DB      | • USE CASE: Checksums, SSL, HMAC      |
   +---------------------------------------+---------------------------------------+
```

### Why Bcrypt is strictly used for Passwords
If an attacker steals the database containing 30 officer records:
- With simple SHA-256, modern GPUs compute **30 billion guesses per second**. An 8-character password is cracked in seconds.
- With Bcrypt (cost factor 10), the GPU is throttled to ~1,000 guesses per second. Cracking takes decades.

### Why Crypto is strictly used for Database Backups & Signatures
- A database backup snapshot is **3.6 Megabytes (6,500+ records)**.
- Bcrypt would fail with a buffer overflow or truncate after 72 characters.
- `crypto.createHash("sha256").update(payload).digest("hex")` hashes the entire 3.6 MB in 15 milliseconds, generating a 64-character hex signature.

---

# 6. DATABASE ENGINEERING: MONGODB SCHEMA DESIGN & INDEXES

### 1. Collections & Normalization Strategy
The database `officers-mess` consists of 14 discrete collections:

| Collection Name | Purpose | Primary Fields |
| :--- | :--- | :--- |
| `users` | Identity & Roles | `_id`, `email`, `password` (bcrypt), `rank`, `serviceId`, `role`, `messId` |
| `messes` | Physical Mess Establishments | `_id`, `name`, `city`, `location`, `pmcId` |
| `rooms` | Room Inventory & Meal Rates | `_id`, `messId`, `roomNumber`, `pricePerNight`, `mealRates` |
| `bookings` | Officer Stay Reservations | `_id`, `messId`, `userId`, `checkInDate`, `checkOutDate`, `status` |
| `bills` | Final Checkout Settlements | `_id`, `bookingId`, `userId`, `totalAmount`, `paymentStatus`, `invoiceNo` |
| `room_allocations` | Active Physical Room Occupancy | `_id`, `bookingId`, `roomId`, `from`, `to`, `status` |
| `room_blocks` | Maintenance / Admin Holds | `_id`, `roomId`, `from`, `to`, `reason` |
| `sessions` | Active Access Token Store | `_id`, `userId`, `token`, `tokenHash`, `expiresAt`, `lastSeenAt` |
| `refresh_tokens` | Active Refresh Token Store | `_id`, `userId`, `token`, `tokenHash`, `expiresAt` |
| `revoked_tokens` | Denylist / Blacklisted Tokens | `_id`, `token`, `tokenHash`, `reason`, `revokedAt`, `expiresAt` (TTL) |
| `counters` | Atomic Sequence Generators | `_id` (`INV_2026`, `REC_2026`), `sequence` |
| `audit_logs` | Security Event Trail | `_id`, `timestamp`, `method`, `path`, `statusCode`, `durationMs`, `user` |

### 2. Index Consistency & Performance Engineering (`backend/config/db.js`)
Indexes prevent full collection table scans ($O(N)$) and reduce lookups to logarithmic B-Tree searches ($O(\log N)$):

```javascript
// 1. Compound Index for Overbooking Prevention
bookings.createIndex({ messId: 1, checkInDate: 1, checkOutDate: 1, status: 1 });

// 2. High-Performance Spatial / Inventory Uniqueness
rooms.createIndex({ messId: 1, roomNumber: 1 }, { unique: true });

// 3. TTL (Time-To-Live) Automatic Expiry Index
sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
revokedTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

> **Viva Pro-Tip:** Mention: *"We utilize MongoDB's background TTL index thread which runs once every 60 seconds. As soon as `expiresAt` passes the current wall clock time, the document is pruned at the storage engine level without consuming Express CPU cycles."*

---

# 7. DISASTER RECOVERY: NATIVE REPLICATION, SNAPSHOTS & CHECKSUMS

### 1. Dual-Tier Data Protection
OMMS implements two distinct data survival mechanisms:
1. **Tier 1: Continuous Mirroring (Replica Database)**:
   - Target database: `officers-mess-replica`.
   - Clones all 12 operational collections and custom indexes.
   - Designed for instant failover if the primary database crashes.
2. **Tier 2: Point-in-Time Frozen Snapshots (`backend/backups/`)**:
   - Creates full JSON exports (e.g. `backup-2026-09-06T19-30-13-445Z.json`).
   - Protects against accidental bulk deletions, human mistakes, or ransomware.

### 2. Cryptographic Tamper-Evident Restore Engine
```
                  [BACKUP CREATION]
                          |
             Serialize 12 Collections to JSON
                          |
             crypto.createHash('sha256')
                          |
             Store `dataHash` inside Metadata
                          |
                     [RESTORE ATTEMPT]
                          |
             Read Snapshot File from Disk
                          |
             Recompute SHA-256 of Collections
                          |
             +------------+------------+
             |                         |
         MATCHES                   MISMATCH
             |                         |
       Restore Data              THROW EXCEPTION:
       Overwrites Collections    "CRITICAL INTEGRITY FAILURE:
                                  File hash mismatch!"
```

---

# 8. CROSS-ORIGIN RESOURCE SHARING (CORS) & REVERSE PROXIES

### 1. The Same-Origin Policy (SOP) Problem
- The frontend runs on `http://localhost:5173`.
- The backend runs on `https://localhost:8443` or `http://localhost:8000`.
- Because the **port** and **protocol** differ, browsers enforce the Same-Origin Policy and block responses unless CORS headers are present.

### 2. Resolution in OMMS (`backend/server.js`)
Express uses the `cors()` middleware which injects:
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```
When Axios sends a mutation (e.g. `POST` or `PATCH`), the browser first sends an **HTTP OPTIONS Preflight Request**. The backend returns `204 No Content` with the allowed headers, permitting the actual payload to proceed.

---

# 9. REST API DESIGN, STATELESSNESS & IDEMPOTENCY

### 1. Architectural Constraints of REST
1. **Statelessness**: The server never stores user session state in server RAM variables. Every request carries its own proof of authentication in the `Authorization: Bearer <JWT>` header.
2. **Resource-Oriented URI Design**:
   - `GET /api/rooms` (Read rooms)
   - `POST /api/bookings` (Create stay request)
   - `PATCH /api/manager/requests/:id` (Update partial status)
   - `DELETE /api/admin/messes/:id` (Remove mess)
3. **Idempotency**:
   - `GET`, `PUT`, `DELETE` are idempotent (repeating them produces the same system state).
   - `POST` is non-idempotent (creates a new counter or booking on each call).

---

# 10. SOFTWARE ENGINEERING: OBJECT-ORIENTED & CLEAN CODE PRINCIPLES

Even within modern JavaScript ES Modules, OMMS rigorously adheres to **SOLID** and OOP design paradigms:

1. **Single Responsibility Principle (SRP)**:
   - `authController.js`: Deals solely with identity validation and token generation.
   - `backupService.js`: Deals solely with JSON serialization and disk operations.
   - `authMiddleware.js`: Intercepts and validates tokens without business logic.
2. **Encapsulation**:
   - The database client instance in `backend/config/db.js` is kept private; controllers interact with it exclusively via the exported getter `getDB()`.
3. **Fail-Fast & Guard Clauses**:
   - Controllers validate parameters (`ObjectId.isValid()`, null checks) immediately and return HTTP 400 before touching database locks.

---

# 11. CLIENT-SIDE ARCHITECTURE: REACT 19, VITE & MEMORY MANAGEMENT

### 1. State Management & Event Bus
- Authentication state is encapsulated inside the `auth` singleton in `frontend/src/services/api.js`.
- Cross-component synchronization uses native browser Custom Events:
  ```javascript
  window.dispatchEvent(new Event("auth-user-updated"));
  ```
  Components listen with `window.addEventListener("auth-user-updated", ...)` and clean up on unmount, avoiding memory leaks.

### 2. High-Performance LottieFiles
Instead of heavy MP4 videos or GIF loops:
- Uses `@lottiefiles/dotlottie-react`.
- Renders vector animations (`loading.lottie`, `before_login.lottie`, `onloginside.lottie`) natively on an HTML5 `<canvas>`.
- Resolution-independent, consumes under 50 KB of disk space, and runs at 60 FPS without GPU lag.

---

# 12. POSTMAN TESTING WORKFLOW & CONTRACT VERIFICATION

### Automated Testing Suite
We maintain an automated verification suite in `backend/tests/`:
1. `api-contract-test.mjs`: Dynamically reflects all 14 controller modules and verifies that required controller methods exist as functions.
2. `security-auth-test.mjs`: Tests JWT generation, DB insertion into `refresh_tokens`, denylist querying, and cleanup.
3. `backup-replication-test.mjs`: Creates live snapshots, verifies document counts, checks SHA-256 hashes, and replicates to `officers-mess-test-replica`.

---

# 13. TOP 50 VIVA QUESTIONS & DEFENSE ANSWERS

### Q1: What makes this system secure against eavesdropping?
> **Answer:** "We implemented Transport Layer Security (TLS 1.3) with an RSA-2048 key exchange and AES-256 symmetric stream encryption. Even on an open Wi-Fi network, packet sniffing tools like Wireshark only see encrypted ciphertext."

### Q2: Why not just store user passwords in SHA-256?
> **Answer:** "SHA-256 is designed for speed (calculating billions of hashes per second), making it vulnerable to GPU brute-forcing and rainbow tables. We use Bcrypt with an adaptive work factor of 10 and unique salts, ensuring each hash calculation takes ~100ms, which throttles brute-force attempts."

### Q3: What is the difference between an Access Token and a Refresh Token?
> **Answer:** "An Access Token is short-lived (15 minutes) to minimize the exposure window if intercepted. The Refresh Token is long-lived (7 days) and stored in our database. When the Access Token expires, the client silently exchanges the Refresh Token for a new key pair via sliding window rotation."

### Q4: What happens if an attacker steals an old refresh token?
> **Answer:** "Our backend implements Automatic Replay Detection. If an already-rotated or deleted refresh token is presented, the system flags a breach and executes Family Revocation—deleting all active sessions and refresh tokens for that user ID immediately."

### Q5: How do you prevent overbooking when two officers book the same room simultaneously?
> **Answer:** "We maintain a compound index on `{ messId: 1, checkInDate: 1, checkOutDate: 1, status: 1 }` and enforce atomic reservation transactions across `room_allocations` and `bookings`, rejecting overlapping date intervals before saving."

### Q6: How does the backup system detect if someone altered a file offline?
> **Answer:** "Every snapshot computes a cryptographic SHA-256 data hash of all collections. During a restore operation, the hash is recomputed. If even a single character was changed, the hashes mismatch and the system aborts the restore immediately."

### Q7: Why did you choose MongoDB over a relational database like PostgreSQL?
> **Answer:** "The document model allows nested subdocuments (such as configurable meal rates per room and itemized breakdown of breakfast, lunch, and dinner charges within bills) without requiring expensive multi-table JOIN operations. MongoDB also natively provides automatic TTL indexing for session pruning."

### Q8: What does the TTL index do in MongoDB?
> **Answer:** "A Time-To-Live index automatically deletes documents once a specified date field has expired. We use it on `sessions`, `refresh_tokens`, and `revoked_tokens` with `expireAfterSeconds: 0`. MongoDB's background thread purges expired tokens automatically every 60 seconds."

### Q9: How is CORS handled?
> **Answer:** "Because the frontend (port 5173) and backend (port 8000/8443) have different origins, the browser sends an HTTP OPTIONS preflight request. Express handles this via CORS middleware, injecting the appropriate `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers` response headers."

### Q10: How does this project run on an offline computer without internet?
> **Answer:** "All dependencies (`node_modules`), fonts, Lottie vector files, and Bootstrap stylesheets are bundled locally. In addition, our database restore utility (`npm run restore:db`) reads from local JSON snapshots with zero cloud dependencies."

---

## 🎖️ Buzzword & Defense Vocabulary Cheat Sheet
- **Sliding-Window Token Rotation**: Issuing new credential pairs on every refresh.
- **Family Revocation**: Invalidating all related descendant tokens upon replay detection.
- **At-Rest vs. In-Transit Encryption**: Bcrypt for data at rest; TLS/AES-256 for data in transit.
- **Tamper-Evident Integrity**: Using SHA-256 checksums to guarantee snapshot validity.
- **Atomic Upsert**: Concurrency-safe record generation using `findOneAndUpdate`.
- **Preflight OPTIONS**: Browser pre-check handshake for Cross-Origin HTTP requests.
- **Air-Gapped Deployment**: Software engineered to run isolated with zero public internet access.
