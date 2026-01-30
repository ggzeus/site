# Auth API Documentation

## New Endpoints

### 1. POST `/auth/hwid` (GetHWID)

**Purpose:** Update HWID for a key and its linked user.

**Request Body:**
```json
{
  "appId": "string",
  "key": "string",
  "hwid": "string",
  "session_id": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "HWID updated successfully"
}
```

**Usage:** Called by Loader after license activation to register/update the hardware ID.

---

### 2. POST `/auth/components` (GetComponents)

**Purpose:** Store hardware components (GPU, Motherboard, CPU) for HWID reset protection.

**Request Body:**
```json
{
  "appId": "string",
  "key": "string",
  "hwid": "string",
  "gpu": "string",
  "motherboard": "string",
  "cpu": "string",
  "session_id": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Components updated successfully",
  "previous_components": { ... },
  "current_components": {
    "gpu": "NVIDIA GeForce RTX 3080",
    "motherboard": "ASUS ROG STRIX B550-F",
    "cpu": "AMD Ryzen 7 5800X",
    "recorded_at": "2026-01-30T18:29:00.000Z"
  }
}
```

**Usage:** Called by Loader to register hardware components. Allows admins to verify if user changed hardware before approving HWID reset.

---

### 3. POST `/auth/log-login` (SendLogLogin)

**Purpose:** Log user login events and update last_login timestamp.

**Request Body:**
```json
{
  "appId": "string",
  "username_or_key": "string",
  "hwid": "string",
  "session_id": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login logged successfully"
}
```

**Usage:** Called by Loader after successful authentication to track login history.

**Database:** Creates entries in `app_login_logs` collection with timestamp and IP.

---

## Modified Endpoint

### POST `/auth/license` (Enhanced)

**New Feature:** Auto-creates user when key is used without an associated user.

**Behavior:**
- When a key is activated for the first time
- If `linked_user_id` is null
- Creates new user in `app_users` with:
  - `username` = key
  - `password` = key
  - `hwid` = provided HWID
  - `expires_at` = key expiration
- Links user to key via `linked_user_id` field

**Example:**
```
Key: "KEY-ABC123XYZ456"
→ Auto-creates user with username "KEY-ABC123XYZ456" and password "KEY-ABC123XYZ456"
```

---

## C++ Loader Integration

### New Functions

**Hardware Detection:**
```cpp
string GetGPU();          // Returns GPU name via WMI
string GetMotherboard();  // Returns motherboard model via WMI
string GetCPU();          // Returns CPU name via WMI
```

**API Calls:**
```cpp
bool SendHWID(const string& licenseKey);
bool SendComponents(const string& licenseKey);
bool SendLoginLog(const string& username_or_key);
```

### Authentication Flow

**License Key Flow:**
1. User enters license key
2. `CheckLicense()` validates key
3. If successful:
   - `SendHWID()` - Updates HWID
   - `SendComponents()` - Registers hardware
   - `SendLoginLog()` - Logs login event

**Username/Password Flow:**
1. User enters credentials
2. `Login()` validates credentials
3. If successful:
   - `SendLoginLog()` - Logs login event

---

## Firestore Collections

### `app_keys` (Modified)
```javascript
{
  key: string,
  appId: string,
  status: "unused" | "used",
  hwid: string,
  hwid_updated_at: string,
  linked_user_id: string,  // NEW
  components: {            // NEW
    gpu: string,
    motherboard: string,
    cpu: string,
    recorded_at: string
  },
  // ... existing fields
}
```

### `app_users` (Modified)
```javascript
{
  appId: string,
  username: string,
  password: string,
  hwid: string,
  hwid_updated_at: string,
  components: {            // NEW
    gpu: string,
    motherboard: string,
    cpu: string,
    recorded_at: string
  },
  last_login: string,
  // ... existing fields
}
```

### `app_login_logs` (New Collection)
```javascript
{
  appId: string,
  key_or_username: string,
  hwid: string,
  ip: string,
  timestamp: string
}
```

---

## Security Notes

1. **HWID Protection:** Components are stored to verify hardware changes before HWID reset approval
2. **Login Tracking:** All logins are logged with IP and timestamp for audit purposes
3. **Auto-User Creation:** Users created from keys have key as password (consider hashing in production)
