const admin = require("firebase-admin");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const serviceAccount = require("../firebase-service-account.json");

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Connect to SQLite
const dbPath = path.join(__dirname, "../database/scarlet.db");
const sqlite = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error("Error opening SQLite database:", err.message);
        process.exit(1);
    }
    console.log("Connected to SQLite database.");
});

async function migrateTable(tableName, collectionName, idField = "id") {
    console.log(`Starting migration for table: ${tableName} -> ${collectionName}`);
    return new Promise((resolve, reject) => {
        sqlite.all(`SELECT * FROM ${tableName}`, async (err, rows) => {
            if (err) {
                console.error(`Error reading table ${tableName}:`, err);
                return reject(err);
            }

            if (rows.length === 0) {
                console.log(`No data in table ${tableName}.`);
                return resolve();
            }

            const batchSize = 500;
            let batch = db.batch();
            let count = 0;
            let total = 0;

            for (const row of rows) {
                // Use the original ID as the document ID to preserve relationships (converted to string)
                const docId = String(row[idField]);
                const docRef = db.collection(collectionName).doc(docId);

                // Ensure numbers are numbers, strings are strings, etc.
                // SQLite might perform loose typing, but Firestore is strict.
                // We take the row as is, mainly.

                // Firestore has a 1MB limit per document.
                // We check for large string fields (like base64 images) and handle them.
                const cleanedRow = { ...row };

                // Iterate over keys to check size
                for (const key in cleanedRow) {
                    const value = cleanedRow[key];
                    if (typeof value === 'string') {
                        // Check for big strings (likely Base64 images)
                        if (value.length > 900000) {
                            console.warn(`[WARNING] Field '${key}' in ${tableName} ID ${docId} is too large (${value.length} chars). Saving to disk...`);

                            try {
                                const fs = require('fs');
                                const uploadsDir = path.join(__dirname, "../uploads/migrated");
                                if (!fs.existsSync(uploadsDir)) {
                                    fs.mkdirSync(uploadsDir, { recursive: true });
                                }

                                // Detect extension from Base64 header if present
                                let ext = 'bin';
                                const matches = value.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                                let buffer;

                                if (matches && matches.length === 3) {
                                    ext = matches[1].split('/')[1] || 'png';
                                    buffer = Buffer.from(matches[2], 'base64');
                                } else {
                                    // Try raw base64 or just text
                                    buffer = Buffer.from(value, 'base64');
                                }

                                const filename = `${tableName}_${docId}_${key}.${ext}`;
                                const filePath = path.join(uploadsDir, filename);
                                fs.writeFileSync(filePath, buffer);

                                const publicUrl = `/uploads/migrated/${filename}`;
                                cleanedRow[key] = publicUrl;
                                console.log(`[SAVED] Saved large field to ${publicUrl}`);
                            } catch (e) {
                                console.error(`[ERROR] Failed to save large field to disk`, e);
                                cleanedRow[key] = 'https://cdn.discordapp.com/embed/avatars/0.png'; // Fallback
                            }
                        }
                    }
                }

                batch.set(docRef, cleanedRow);
                count++;
                total++;

                if (count >= batchSize) {
                    await batch.commit();
                    console.log(`Committed batch of ${count} documents for ${collectionName}.`);
                    batch = db.batch();
                    count = 0;
                }
            }

            if (count > 0) {
                await batch.commit();
                console.log(`Committed final batch of ${count} documents for ${collectionName}.`);
            }

            console.log(`Completed migration for ${tableName}. Total: ${total}`);
            resolve();
        });
    });
}

async function migrate() {
    try {
        // Users
        await migrateTable("users", "users");

        // Products
        await migrateTable("products", "products");

        // Licenses
        await migrateTable("licenses", "licenses");

        // Resellers
        await migrateTable("resellers", "resellers");

        // Comments (Docs)
        await migrateTable("comments", "comments");

        // Posts
        await migrateTable("posts", "posts");

        // Post Likes
        await migrateTable("post_likes", "post_likes");

        // Post Comments
        await migrateTable("post_comments", "post_comments");

        // Chat Messages
        await migrateTable("chat_messages", "chat_messages");

        // AI Memory
        await migrateTable("ai_memory", "ai_memory");

        // Tickets
        await migrateTable("tickets", "tickets");

        // HWID Requests
        await migrateTable("hwid_requests", "hwid_requests");

        // Pending Payments
        await migrateTable("pending_payments", "pending_payments");

        console.log("Migration finished successfully.");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        sqlite.close();
    }
}

migrate();
