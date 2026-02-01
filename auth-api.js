const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const admin = require("firebase-admin");
const db = admin.firestore();
const discordLogger = require('./discord-logger'); // Discord Logging System

// --- AUTH SYSTEM (Inspired by KeyAuth, Enhanced Security) ---

// --- HELPERS ---

// Generate secure random string
const generateRandomString = (length) => {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

// HMAC-SHA256 Signature Verification
const verifySignature = (payload, signature, secret) => {
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return computed === signature;
};

// Middleware: Check Partner Role
const isPartner = async (req, res, next) => {
    const { userId } = req.body; // Assuming userId is sent in body for management APIs
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    try {
        const doc = await db.collection('users').doc(String(userId)).get();
        if (!doc.exists) return res.status(401).json({ message: "User not found" });
        const data = doc.data();
        if (data.role !== 'partner' && data.role !== 'admin' && data.role !== 'founder') {
            return res.status(403).json({ message: "Access Denied: Partner Only" });
        }
        req.userRole = data.role; // Pass role to next handler
        next();
    } catch (e) {
        console.error("Partner Check Error:", e);
        res.status(500).json({ message: "Internal Error" });
    }
};

// --- MANAGEMENT API (For Dashboard) ---

// 1. Create Application
router.post('/api/app/create', isPartner, async (req, res) => {
    const { userId, name } = req.body;

    if (!name) return res.status(400).json({ message: "Name required" });

    try {
        const appSecret = generateRandomString(64);
        const ownerId = String(userId);

        const appData = {
            name,
            ownerId,
            secret: appSecret,
            status: 'active',
            version: '1.0',
            created_at: new Date().toISOString(),
            hwid_enabled: true,
            max_sessions: 1 // Default 1 per user
        };

        const docRef = await db.collection('applications').add(appData);
        res.json({ message: "Application Created", appId: docRef.id, secret: appSecret });
    } catch (e) {
        console.error("Create App Error:", e);
        res.status(500).json({ message: "Error creating application" });
    }
});

// 2. List My Applications
router.get('/api/app/list/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Verify user has permission to access applications
        const userDoc = await db.collection('users').doc(String(userId)).get();

        if (!userDoc.exists) {
            // Log suspicious access - user doesn't exist
            discordLogger.logSuspiciousApplicationAccess({
                userId: userId,
                username: 'Unknown',
                role: 'none',
                ip: req.ip || req.connection.remoteAddress,
                reason: 'Tentativa de acesso com userId inexistente'
            }).catch(err => console.error('[SUSPICIOUS-APP-LOG] Error:', err));

            return res.status(404).json({ message: "User not found" });
        }

        const userData = userDoc.data();
        const userRole = userData.role || 'user';

        // Check if user has permission (must be partner or admin)
        if (userRole !== 'partner' && userRole !== 'admin' && userRole !== 'founder') {
            // Log suspicious access - unauthorized role
            discordLogger.logSuspiciousApplicationAccess({
                userId: userId,
                username: userData.username || 'Unknown',
                role: userRole,
                ip: req.ip || req.connection.remoteAddress,
                reason: 'Tentativa de acesso sem permissão (role não autorizado)'
            }).catch(err => console.error('[SUSPICIOUS-APP-LOG] Error:', err));

            return res.status(403).json({ message: "Access Denied: Partner or Admin only" });
        }

        // Log normal access to Discord
        discordLogger.logApplicationAccess({
            userId: userId,
            username: userData.username || 'Unknown',
            role: userRole,
            ip: req.ip || req.connection.remoteAddress
        }).catch(err => console.error('[APP-ACCESS-LOG] Error:', err));

        // Partners see own apps, Admins see all? Let's restrict to owner for now
        // Or check role first. For simplicity, just query by ownerId.
        const snapshot = await db.collection('applications').where('ownerId', '==', String(userId)).get();
        const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ apps });
    } catch (e) {
        res.status(500).json({ message: "Error fetching apps" });
    }
});

// 3. Get Application Stats
router.get('/api/app/:appId/stats', async (req, res) => {
    const { appId } = req.params;
    try {
        const usersCount = (await db.collection('app_users').where('appId', '==', appId).count().get()).data().count;
        const keysCount = (await db.collection('app_keys').where('appId', '==', appId).count().get()).data().count;
        // const sessionsCount = (await db.collection('app_sessions').where('appId', '==', appId).count().get()).data().count; // Optional

        res.json({ users: usersCount, keys: keysCount });
    } catch (e) {
        res.status(500).json({ message: "Error fetching stats" });
    }
});

// 4. Generate Keys
router.post('/api/app/:appId/keys/generate', isPartner, async (req, res) => {
    const { appId } = req.params;
    const { count, days, type = 'license', mask, note, level } = req.body; // Expanded fields

    if (!count || count < 1) return res.status(400).json({ message: "Invalid count" });

    try {
        const batch = db.batch();
        const generatedKeys = [];

        for (let i = 0; i < count; i++) {
            let key;
            if (mask) {
                // Apply Mask Logic (e.g., "KEY-******")
                key = mask.replace(/\*/g, () => {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    return chars.charAt(Math.floor(Math.random() * chars.length));
                });
            } else {
                key = `KEY-${generateRandomString(16).toUpperCase()}`;
            }

            const keyRef = db.collection('app_keys').doc();
            const keyData = {
                key,
                appId,
                days: parseInt(days) || 30,
                status: 'unused',
                type,
                level: parseInt(level) || 1,
                note: note || "",
                created_at: new Date().toISOString()
            };
            batch.set(keyRef, keyData);
            generatedKeys.push(key);
        }

        await batch.commit();

        // Log to Discord (logs-apps)
        try {
            const appDoc = await db.collection('applications').doc(appId).get();
            const appName = appDoc.exists ? appDoc.data().name : appId;
            const userDoc = await db.collection('users').doc(String(req.body.userId)).get();
            const username = userDoc.exists ? userDoc.data().username : 'Unknown';

            discordLogger.logKeyCreation({
                appId: appId,
                appName: appName,
                username: username,
                count: count,
                days: days || 30,
                mask: mask || 'Padrão'
            }).catch(err => console.error('[KEY-CREATION-LOG] Error:', err));
        } catch (logError) {
            console.error('[KEY-CREATION-LOG] Error fetching data:', logError);
        }

        res.json({ message: "Keys Generated", keys: generatedKeys });
    } catch (e) {
        console.error("Generate Keys Error:", e);
        res.status(500).json({ message: "Error generating keys" });
    }
});

// 5. List Keys
router.get('/api/app/:appId/keys', async (req, res) => {
    const { appId } = req.params;
    try {
        const snapshot = await db.collection('app_keys').where('appId', '==', appId).get();
        const keys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ keys });
    } catch (e) {
        res.status(500).json({ message: "Error fetching keys" });
    }
});

// 6. Delete Key
router.delete('/api/app/:appId/keys/:keyId', isPartner, async (req, res) => {
    const { keyId } = req.params; // keyId is the doc ID
    try {
        // Fetch key info before deletion for logging
        const keyDoc = await db.collection('app_keys').doc(keyId).get();
        const keyData = keyDoc.exists ? keyDoc.data() : null;

        await db.collection('app_keys').doc(keyId).delete();

        // Log to Discord (logs-apps)
        if (keyData) {
            try {
                const appDoc = await db.collection('applications').doc(keyData.appId).get();
                const appName = appDoc.exists ? appDoc.data().name : keyData.appId;
                const userDoc = await db.collection('users').doc(String(req.body.userId)).get();
                const username = userDoc.exists ? userDoc.data().username : 'Unknown';

                discordLogger.logKeyBlacklisted({
                    appId: keyData.appId,
                    appName: appName,
                    keyId: keyId,
                    reason: 'Key deletada manualmente',
                    username: username
                }).catch(err => console.error('[KEY-DELETE-LOG] Error:', err));
            } catch (logError) {
                console.error('[KEY-DELETE-LOG] Error fetching data:', logError);
            }
        }

        res.json({ message: "Key Deleted" });
    } catch (e) {
        res.status(500).json({ message: "Error" });
    }
});

// 7. List Users (App Users)
router.get('/api/app/:appId/users', async (req, res) => {
    const { appId } = req.params;
    try {
        const snapshot = await db.collection('app_users').where('appId', '==', appId).get();
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ users });
    } catch (e) {
        res.status(500).json({ message: "Error fetching users" });
    }
});

// 8. Blacklist Management
router.post('/api/app/:appId/blacklist', isPartner, async (req, res) => {
    const { appId } = req.params;
    const { type, value, reason } = req.body; // type: 'ip' or 'hwid'

    try {
        await db.collection('app_blacklist').add({
            appId, type, value, reason, created_at: new Date().toISOString()
        });
        res.json({ message: "Blacklisted" });
    } catch (e) {
        res.status(500).json({ message: "Error" });
    }
});


// --- PUBLIC AUTH CLIENT API (For C# / C++ / Python Clients) ---

// 1. Initialize
router.post('/auth/init', async (req, res) => {
    const { name, ownerId, secret, version } = req.body;

    try {
        console.log(`[AUTH/INIT] Request: name="${name}", ownerId="${ownerId}", version="${version}"`);

        const appsRef = db.collection('applications');
        const snapshot = await appsRef.where('name', '==', name).where('ownerId', '==', String(ownerId)).limit(1).get();

        console.log(`[AUTH/INIT] Query result: ${snapshot.empty ? 'EMPTY' : 'FOUND'}, docs: ${snapshot.docs.length}`);

        if (snapshot.empty) return res.status(404).json({ success: false, message: "Application not found" });

        const appDoc = snapshot.docs[0];
        const appData = appDoc.data();

        if (appData.secret !== secret) return res.status(403).json({ success: false, message: "Invalid Application Secret" });
        if (appData.status !== 'active') return res.status(403).json({ success: false, message: "Application Disabled" });

        // Version Check
        if (version !== appData.version) {
            return res.status(403).json({ success: false, message: "Update Required", download: appData.download_link || "" });
        }

        const session_id = generateRandomString(32);

        res.json({
            success: true,
            message: "Initialized",
            session_id,
            appId: appDoc.id, // Return appId for client to use in subsequent requests
            app_info: {
                numUsers: (await db.collection('app_users').where('appId', '==', appDoc.id).count().get()).data().count,
                numOnlineUsers: 0, // Implement real tracking later
                version: appData.version
            }
        });

    } catch (e) {
        console.error("Init Error:", e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});


// 2. Login (User/Pass)
router.post('/auth/login', async (req, res) => {
    const { username, password, session_id, hwid, appId } = req.body;
    // ... Verify Session ID ...

    try {
        const usersRef = db.collection('app_users');
        const snapshot = await usersRef.where('appId', '==', appId).where('username', '==', username).limit(1).get();

        if (snapshot.empty) return res.status(404).json({ success: false, message: "User not found" });

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        if (userData.password !== password) return res.status(403).json({ success: false, message: "Invalid Password" }); // Ideally hash verify

        // HWID Check
        if (userData.hwid && userData.hwid !== hwid) {
            return res.status(403).json({ success: false, message: "Invalid HWID" });
        } else if (!userData.hwid) {
            // Lock HWID on first login
            await userDoc.ref.update({ hwid });
        }

        // Sub Check
        const now = new Date();
        const expires = new Date(userData.expires_at);
        if (expires < now) {
            return res.status(403).json({ success: false, message: "Subscription Expired" });
        }

        res.json({
            success: true,
            message: "Logged In",
            info: {
                username: userData.username,
                subscriptions: [{ subscription: "default", expiry: userData.expires_at, timeleft: Math.max(0, (expires - now) / 1000) }],
                ip: req.ip,
                hwid: hwid,
                createdate: userData.created_at,
                lastlogin: now.toISOString()
            }
        });

        // Log Login
        await userDoc.ref.update({ last_login: now.toISOString(), ip: req.ip });

    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ success: false, message: "Login Error" });
    }
});


// 3. License (Key Only Login)
router.post('/auth/license', async (req, res) => {
    const { key, hwid, appId, session_id } = req.body;

    try {
        const keysRef = db.collection('app_keys');
        const snapshot = await keysRef.where('appId', '==', appId).where('key', '==', key).limit(1).get();

        if (snapshot.empty) return res.status(404).json({ success: false, message: "Key Not Found" });

        const keyDoc = snapshot.docs[0];
        const keyData = keyDoc.data();

        if (keyData.status === 'used') {
            if (keyData.hwid && keyData.hwid !== hwid) return res.status(403).json({ success: false, message: "Key used on another machine" });

            // Check expiry
            if (keyData.expires_at) {
                const now = new Date();
                const expires = new Date(keyData.expires_at);
                if (expires < now) return res.status(403).json({ success: false, message: "Key Expired" });

                return res.json({
                    success: true,
                    message: "Authenticated",
                    info: { username: key, subscriptions: [{ subscription: "default", expiry: keyData.expires_at }], timeleft: (expires - now) / 1000 }
                });
            }
        }

        // Activate Key (First Use)
        const now = new Date();
        const expires = new Date();
        expires.setDate(expires.getDate() + keyData.days);

        await keyDoc.ref.update({
            status: 'used',
            hwid: hwid,
            activated_at: now.toISOString(),
            expires_at: expires.toISOString()
        });

        // AUTO-CREATE USER if no linked_user_id exists
        if (!keyData.linked_user_id) {
            try {
                // Create user with key as username and password
                const newUserRef = await db.collection('app_users').add({
                    appId: appId,
                    username: key,
                    password: key,
                    hwid: hwid,
                    created_at: now.toISOString(),
                    expires_at: expires.toISOString(),
                    last_login: now.toISOString(),
                    subscription: keyData.type || 'license',
                    level: keyData.level || 1
                });

                await keyDoc.ref.update({ linked_user_id: newUserRef.id });

                console.log(`[AUTH/LICENSE] Auto-created user ${newUserRef.id} for key ${key}`);
            } catch (userCreateError) {
                console.error("[AUTH/LICENSE] Error creating user:", userCreateError);
            }
        }

        // Log to Discord (logs-apps)
        try {
            const appDoc = await db.collection('applications').doc(appId).get();
            const appName = appDoc.exists ? appDoc.data().name : appId;

            discordLogger.logKeyRedeemed({
                appId: appId,
                appName: appName,
                key: key,
                hwid: hwid,
                username: 'Auto-criado'
            }).catch(err => console.error('[KEY-REDEEM-LOG] Error:', err));
        } catch (logError) {
            console.error('[KEY-REDEEM-LOG] Error fetching data:', logError);
        }

        res.json({
            success: true,
            message: "Key Activated",
            info: { username: key, subscriptions: [{ subscription: "default", expiry: expires.toISOString() }], timeleft: (expires - now) / 1000 }
        });

    } catch (e) {
        console.error("License Error:", e);
        res.status(500).json({ success: false, message: "Error" });
    }
});



// 4. Update HWID (GetHWID)
router.post('/auth/hwid', async (req, res) => {
    const { appId, key, hwid, session_id } = req.body;

    if (!appId || !key || !hwid) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        const keysRef = db.collection('app_keys');
        const snapshot = await keysRef.where('appId', '==', appId).where('key', '==', key).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: "Key not found" });
        }

        const keyDoc = snapshot.docs[0];
        const keyData = keyDoc.data();

        await keyDoc.ref.update({ hwid: hwid, hwid_updated_at: new Date().toISOString() });

        if (keyData.linked_user_id) {
            await db.collection('app_users').doc(keyData.linked_user_id).update({
                hwid: hwid,
                hwid_updated_at: new Date().toISOString()
            });
        }

        res.json({ success: true, message: "HWID updated successfully" });
    } catch (e) {
        console.error("HWID Update Error:", e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 5. Store/Get Components (GetComponents)
router.post('/auth/components', async (req, res) => {
    const { appId, key, hwid, gpu, motherboard, cpu, session_id } = req.body;

    if (!appId || !key || !hwid) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        const keysRef = db.collection('app_keys');
        const snapshot = await keysRef.where('appId', '==', appId).where('key', '==', key).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: "Key not found" });
        }

        const keyDoc = snapshot.docs[0];
        const keyData = keyDoc.data();

        const existingComponents = keyData.components || null;

        const newComponents = {
            gpu: gpu || "",
            motherboard: motherboard || "",
            cpu: cpu || "",
            recorded_at: new Date().toISOString()
        };

        await keyDoc.ref.update({ components: newComponents });

        if (keyData.linked_user_id) {
            await db.collection('app_users').doc(keyData.linked_user_id).update({
                components: newComponents
            });
        }

        res.json({
            success: true,
            message: "Components updated successfully",
            previous_components: existingComponents,
            current_components: newComponents
        });
    } catch (e) {
        console.error("Components Update Error:", e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 6. Log Login (SendLogLogin)
router.post('/auth/log-login', async (req, res) => {
    const { appId, username_or_key, hwid, components, session_id } = req.body;

    if (!appId || !username_or_key) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        const now = new Date().toISOString();
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        let finalComponents = components || null;

        // Update last_login on key or user AND fetch components if missing
        let foundDoc = null;

        // Try to find as key first
        const keySnapshot = await db.collection('app_keys')
            .where('appId', '==', appId)
            .where('key', '==', username_or_key)
            .limit(1)
            .get();

        if (!keySnapshot.empty) {
            foundDoc = keySnapshot.docs[0];
            await foundDoc.ref.update({ last_login: now });
        } else {
            // Try as username
            const userSnapshot = await db.collection('app_users')
                .where('appId', '==', appId)
                .where('username', '==', username_or_key)
                .limit(1)
                .get();

            if (!userSnapshot.empty) {
                foundDoc = userSnapshot.docs[0];
                await foundDoc.ref.update({ last_login: now });
            }
        }

        // Fallback: If components not sent in body, try to use what we have in DB
        if (!finalComponents && foundDoc) {
            const data = foundDoc.data();
            if (data.components) {
                finalComponents = data.components;
            }
        }

        // Create login log entry
        await db.collection('app_login_logs').add({
            appId: appId,
            key_or_username: username_or_key,
            hwid: hwid || "",
            components: finalComponents, // Capture components if sent or found
            ip: ip,
            timestamp: now
        });

        // Log to Discord (logs-inject)
        discordLogger.logLoaderLogin({
            appId: appId,
            username: username_or_key,
            hwid: hwid || "",
            ip: ip,
            components: finalComponents,
            success: true
        }).catch(err => console.error('[LOADER-LOGIN-LOG] Error:', err));

        res.json({ success: true, message: "Login logged successfully" });
    } catch (e) {
        console.error("Login Log Error:", e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 7. Get Logs (GetLogs)
router.get('/api/app/:appId/logs', async (req, res) => {
    const { appId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    try {
        // Fetch last 500 logs (Hard limit for in-memory sort to be safe)
        // NOTE: Optimized to sort in memory to avoid Firestore Composite Index requirements
        const snapshot = await db.collection('app_login_logs')
            .where('appId', '==', appId)
            .limit(500)
            .get();

        let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort Descending by timestamp
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Pagination logic
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedLogs = logs.slice(startIndex, endIndex);
        const hasMore = endIndex < logs.length;

        res.json({
            logs: paginatedLogs,
            hasMore,
            totalInMemory: logs.length
        });
    } catch (e) {
        console.error("Get Logs Error:", e);
        res.status(500).json({ message: "Error fetching logs" });
    }
});


// --- LOADER SPECIFIC APIs ---

// 8. Upload Secure Payload (exe/dll) to Firebase Storage
router.post('/auth/payload/upload', isPartner, async (req, res) => {
    const { userId, appId, productName, fileData, fileName } = req.body;

    if (!appId || !productName || !fileData || !fileName) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        // Verify app ownership
        const appDoc = await db.collection('applications').doc(appId).get();
        if (!appDoc.exists) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const appData = appDoc.data();
        if (appData.ownerId !== String(userId)) {
            return res.status(403).json({ success: false, message: "Not application owner" });
        }

        // Validate file extension
        const allowedExtensions = ['.exe', '.dll'];
        const fileExt = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        if (!allowedExtensions.includes(fileExt)) {
            return res.status(400).json({ success: false, message: "Only .exe and .dll files allowed" });
        }

        // Decode base64 file data
        const buffer = Buffer.from(fileData, 'base64');

        // Get Firebase Storage bucket
        let bucket;
        try {
            bucket = admin.storage().bucket();
        } catch (bucketError) {
            console.error("Firebase Storage bucket error:", bucketError);
            return res.status(500).json({
                success: false,
                message: "Firebase Storage not configured",
                error: "Please enable Firebase Storage in your Firebase Console and ensure the storageBucket is correctly set in firebase-service-account.json"
            });
        }

        const storagePath = `payloads/${appId}/${productName}${fileExt}`;
        const file = bucket.file(storagePath);

        // Upload to Firebase Storage with metadata
        try {
            await file.save(buffer, {
                metadata: {
                    contentType: fileExt === '.exe' ? 'application/x-msdownload' : 'application/x-dll',
                    metadata: {
                        uploadedBy: userId,
                        productName: productName,
                        appId: appId,
                        uploadedAt: new Date().toISOString()
                    }
                }
            });

            // Make file accessible (but only via signed URLs for security)
            await file.makePrivate();
        } catch (uploadError) {
            console.error("File upload error:", uploadError);

            // Check if it's a bucket not found error
            if (uploadError.message && uploadError.message.includes('bucket does not exist')) {
                return res.status(500).json({
                    success: false,
                    message: "Firebase Storage bucket not found",
                    error: "Please enable Firebase Storage in your Firebase Console. Go to Storage > Get Started to create a bucket."
                });
            }

            return res.status(500).json({
                success: false,
                message: "Upload failed",
                error: uploadError.message
            });
        }

        // Log upload to Discord
        const userDoc = await db.collection('users').doc(String(userId)).get();
        const username = userDoc.exists ? userDoc.data().username : 'Unknown';

        discordLogger.logPayloadUpload({
            appId: appId,
            appName: appData.name,
            productName: productName,
            fileName: fileName,
            fileSize: buffer.length,
            username: username,
            uploadPath: storagePath
        }).catch(err => console.error('[PAYLOAD-UPLOAD-LOG] Error:', err));

        res.json({
            success: true,
            message: "Payload uploaded successfully",
            storagePath: storagePath,
            fileSize: buffer.length
        });

    } catch (e) {
        console.error("Payload Upload Error:", e);
        res.status(500).json({ success: false, message: "Upload failed", error: e.message });
    }
});

// 8.5. Get Uploaded Files Metadata
router.get('/api/app/:appId/files', async (req, res) => {
    const { appId } = req.params;

    try {
        // Get Firebase Storage bucket
        const bucket = admin.storage().bucket();

        // Check if bucket exists and get files
        let files = [];
        try {
            [files] = await bucket.getFiles({ prefix: `payloads/${appId}/` });
        } catch (bucketError) {
            // If bucket doesn't exist or there's an access error, return empty list
            console.warn(`Storage bucket error for app ${appId}:`, bucketError.message);
            return res.json({ success: true, files: [] });
        }

        // If no files found, return empty array
        if (!files || files.length === 0) {
            return res.json({ success: true, files: [] });
        }

        const filesList = await Promise.all(files.map(async (file) => {
            try {
                const [metadata] = await file.getMetadata();
                const fileName = file.name.split('/').pop();

                return {
                    name: fileName,
                    fullPath: file.name,
                    size: parseInt(metadata.size),
                    contentType: metadata.contentType,
                    uploadedAt: metadata.metadata?.uploadedAt || metadata.timeCreated,
                    uploadedBy: metadata.metadata?.uploadedBy || 'Unknown',
                    productName: metadata.metadata?.productName || fileName.replace(/\.(exe|dll)$/, '')
                };
            } catch (fileError) {
                console.error(`Error getting metadata for file ${file.name}:`, fileError);
                return null;
            }
        }));

        // Filter out any null entries from failed metadata fetches
        const validFiles = filesList.filter(f => f !== null);

        // Sort by upload date (newest first)
        validFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json({ success: true, files: validFiles });
    } catch (e) {
        console.error("Get Files Error:", e);
        res.status(500).json({ success: false, message: "Error fetching files", error: e.message });
    }
});

// 9. Stream/Download Secure Payload (for authenticated loaders)
router.post('/auth/payload/stream', async (req, res) => {
    const { appId, key, hwid, productName, session_id } = req.body;

    if (!appId || !productName || (!key && !hwid)) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        // Verify license validity (key or hwid)
        let keyData = null;
        let keyDoc = null;

        if (key) {
            const keySnapshot = await db.collection('app_keys')
                .where('appId', '==', appId)
                .where('key', '==', key)
                .limit(1)
                .get();

            if (keySnapshot.empty) {
                return res.status(404).json({ success: false, message: "Key not found" });
            }

            keyDoc = keySnapshot.docs[0];
            keyData = keyDoc.data();
        } else if (hwid) {
            const hwidSnapshot = await db.collection('app_keys')
                .where('appId', '==', appId)
                .where('hwid', '==', hwid)
                .limit(1)
                .get();

            if (hwidSnapshot.empty) {
                return res.status(404).json({ success: false, message: "HWID not registered" });
            }

            keyDoc = hwidSnapshot.docs[0];
            keyData = keyDoc.data();
        }

        // Check if key is used and not expired
        if (keyData.status !== 'used') {
            return res.status(403).json({ success: false, message: "Key not activated" });
        }

        if (keyData.expires_at) {
            const now = new Date();
            const expires = new Date(keyData.expires_at);
            if (expires < now) {
                return res.status(403).json({ success: false, message: "Subscription expired" });
            }
        }

        // HWID verification if provided
        if (hwid && keyData.hwid && keyData.hwid !== hwid) {
            return res.status(403).json({ success: false, message: "HWID mismatch" });
        }

        // Generate signed URL for download (valid for 5 minutes)
        const bucket = admin.storage().bucket();

        // Try .exe first, then .dll
        let file = bucket.file(`payloads/${appId}/${productName}.exe`);
        let exists = await file.exists();

        if (!exists[0]) {
            file = bucket.file(`payloads/${appId}/${productName}.dll`);
            exists = await file.exists();
        }

        if (!exists[0]) {
            return res.status(404).json({ success: false, message: "Payload not found for this product" });
        }

        // Generate signed URL (30 seconds expiry)
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 30 * 1000 // 30 seconds
        });

        // Log download to Discord
        const appDoc = await db.collection('applications').doc(appId).get();
        const appName = appDoc.exists ? appDoc.data().name : appId;

        discordLogger.logPayloadDownload({
            appId: appId,
            appName: appName,
            productName: productName,
            key: keyData.key,
            hwid: hwid || keyData.hwid,
            ip: req.ip || req.connection.remoteAddress
        }).catch(err => console.error('[PAYLOAD-DOWNLOAD-LOG] Error:', err));

        res.json({
            success: true,
            message: "Payload ready",
            downloadUrl: signedUrl,
            expiresIn: 30 // seconds
        });

    } catch (e) {
        console.error("Payload Stream Error:", e);
        res.status(500).json({ success: false, message: "Stream failed", error: e.message });
    }
});

// 10. Get User Info by HWID (for remote applications without auth system)
router.get('/auth/get-user/:appId/:hwid', async (req, res) => {
    const { appId, hwid } = req.params;
    const { appSecret } = req.query;

    if (!appId || !appSecret || !hwid) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        // Verify app exists and secret matches
        const appDoc = await db.collection('applications').doc(appId).get();
        if (!appDoc.exists) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const appData = appDoc.data();
        if (appData.secret !== appSecret) {
            return res.status(403).json({ success: false, message: "Invalid app secret" });
        }

        // Search for user by HWID
        const keySnapshot = await db.collection('app_keys')
            .where('appId', '==', appId)
            .where('hwid', '==', hwid)
            .limit(1)
            .get();

        if (keySnapshot.empty) {
            // Log suspicious access - unregistered HWID
            discordLogger.logSuspiciousHWIDAccess({
                appId: appId,
                appName: appData.name,
                hwid: hwid,
                ip: req.ip || req.connection.remoteAddress,
                endpoint: '/auth/get-user',
                reason: 'HWID não registrado'
            }).catch(err => console.error('[SUSPICIOUS-HWID-LOG] Error:', err));

            return res.status(404).json({ success: false, message: "HWID not registered" });
        }

        const keyDoc = keySnapshot.docs[0];
        const keyData = keyDoc.data();

        // Get username from linked user or use key as username
        let username = keyData.key; // Default to key
        if (keyData.linked_user_id) {
            const userDoc = await db.collection('app_users').doc(keyData.linked_user_id).get();
            if (userDoc.exists) {
                username = userDoc.data().username;
            }
        }

        res.json({
            success: true,
            username: username,
            created_at: keyData.activated_at || keyData.created_at
        });

    } catch (e) {
        console.error("GetUser Error:", e);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 11. Get Expiry Info by HWID (for remote applications without auth system)
router.get('/auth/get-expiry/:appId/:hwid', async (req, res) => {
    const { appId, hwid } = req.params;
    const { appSecret } = req.query;

    if (!appId || !appSecret || !hwid) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        // Verify app exists and secret matches
        const appDoc = await db.collection('applications').doc(appId).get();
        if (!appDoc.exists) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const appData = appDoc.data();
        if (appData.secret !== appSecret) {
            return res.status(403).json({ success: false, message: "Invalid app secret" });
        }

        // Search for user by HWID
        const keySnapshot = await db.collection('app_keys')
            .where('appId', '==', appId)
            .where('hwid', '==', hwid)
            .limit(1)
            .get();

        if (keySnapshot.empty) {
            // Log suspicious access - unregistered HWID
            discordLogger.logSuspiciousHWIDAccess({
                appId: appId,
                appName: appData.name,
                hwid: hwid,
                ip: req.ip || req.connection.remoteAddress,
                endpoint: '/auth/get-expiry',
                reason: 'HWID não registrado'
            }).catch(err => console.error('[SUSPICIOUS-HWID-LOG] Error:', err));

            return res.status(404).json({ success: false, message: "HWID not registered" });
        }

        const keyDoc = keySnapshot.docs[0];
        const keyData = keyDoc.data();

        // Calculate expiry info
        const now = new Date();
        const expires = keyData.expires_at ? new Date(keyData.expires_at) : null;

        let daysRemaining = null;
        let isExpired = false;

        if (expires) {
            daysRemaining = Math.max(0, Math.ceil((expires - now) / (1000 * 60 * 60 * 24)));
            isExpired = expires < now;
        }

        res.json({
            success: true,
            expires_at: keyData.expires_at,
            days_remaining: daysRemaining,
            is_expired: isExpired,
            subscription_type: keyData.type || 'license',
            level: keyData.level || 1
        });

    } catch (e) {
        console.error("GetExpiry Error:", e);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;

