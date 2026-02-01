const http = require('http');
const fs = require('fs');
const path = require('path');

// ========================================
// TEST CONFIGURATION
// ========================================
const HOST = 'localhost';
const PORT = 80;

// REPLACE THESE WITH YOUR ACTUAL VALUES
const APP_ID = 'YOUR_APP_ID';              // From Applications dashboard
const APP_SECRET = 'YOUR_APP_SECRET';      // From app secret
const USER_ID = 'YOUR_USER_ID';            // Your user ID (must be partner/admin)
const TEST_KEY = 'YOUR_TEST_KEY';          // A valid, activated key
const TEST_HWID = 'TEST-HWID-12345678';    // HWID associated with the key

// ========================================
// HELPER FUNCTIONS
// ========================================

function makeRequest(path, method, data, callback) {
    const postData = JSON.stringify(data);

    const options = {
        hostname: HOST,
        port: PORT,
        path: path,
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                callback(null, res.statusCode, json);
            } catch (e) {
                callback(null, res.statusCode, body);
            }
        });
    });

    req.on('error', (e) => callback(e));
    req.write(postData);
    req.end();
}

// ========================================
// TEST 1: Upload Payload (Requires Partner Role)
// ========================================
function testPayloadUpload() {
    console.log('\\n' + '='.repeat(60));
    console.log('TEST 1: POST /auth/payload/upload');
    console.log('='.repeat(60));

    // Create a dummy .exe file in base64 for testing
    // In production, you'd read an actual file
    const dummyExeContent = Buffer.from('MZ\\x90\\x00\\x03DUMMY_EXE_FOR_TESTING').toString('base64');

    const data = {
        userId: USER_ID,
        appId: APP_ID,
        productName: 'TestProduct',
        fileName: 'test.exe',
        fileData: dummyExeContent,
        appSecret: APP_SECRET
    };

    makeRequest('/auth/payload/upload', 'POST', data, (err, status, response) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return testPayloadStream();
        }

        console.log(`Status: ${status}`);
        console.log('Response:', JSON.stringify(response, null, 2));

        if (response.success) {
            console.log('\\n✅ Payload upload successful!');
            console.log(`   Storage Path: ${response.storagePath}`);
            console.log(`   File Size: ${response.fileSize} bytes`);
        } else {
            console.log('\\n❌ Payload upload failed:', response.message);
        }

        testPayloadStream();
    });
}

// ========================================
// TEST 2: Download Payload
// ========================================
function testPayloadStream() {
    console.log('\\n' + '='.repeat(60));
    console.log('TEST 2: POST /auth/payload/stream');
    console.log('='.repeat(60));

    const data = {
        appId: APP_ID,
        key: TEST_KEY,
        hwid: TEST_HWID,
        productName: 'TestProduct',
        session_id: 'test-session'
    };

    makeRequest('/auth/payload/stream', 'POST', data, (err, status, response) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return testGetUser();
        }

        console.log(`Status: ${status}`);
        console.log('Response:', JSON.stringify(response, null, 2));

        if (response.success) {
            console.log('\\n✅ Payload download successful!');
            console.log(`   Download URL: ${response.downloadUrl.substring(0, 60)}...`);
            console.log(`   Expires In: ${response.expiresIn}s`);
        } else {
            console.log('\\n❌ Payload download failed:', response.message);
        }

        testGetUser();
    });
}

// ========================================
// TEST 3: Get User by HWID (Valid)
// ========================================
function testGetUser() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: GET /auth/get-user/:appId/:hwid (Valid HWID)');
    console.log('='.repeat(60));

    const path = `/auth/get-user/${APP_ID}/${TEST_HWID}?appSecret=${encodeURIComponent(APP_SECRET)}`;

    const options = {
        hostname: HOST,
        port: PORT,
        path: path,
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(body);
                console.log(`Status: ${res.statusCode}`);
                console.log('Response:', JSON.stringify(response, null, 2));

                if (response.success) {
                    console.log('\n✅ GetUser successful!');
                    console.log(`   Username: ${response.username}`);
                    console.log(`   Created At: ${response.created_at}`);
                } else {
                    console.log('\n❌ GetUser failed:', response.message);
                }

                testGetUserInvalid();
            } catch (e) {
                console.error('Parse error:', e);
                testGetUserInvalid();
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Error:', e.message);
        testGetUserInvalid();
    });

    req.end();
}

// ========================================
// TEST 4: Get User by HWID (Invalid - Should Log Suspicious)
// ========================================
function testGetUserInvalid() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: GET /auth/get-user/:appId/:hwid (Invalid HWID - Suspicious)');
    console.log('='.repeat(60));

    const invalidHwid = 'INVALID-HWID-NOT-REGISTERED-123';
    const path = `/auth/get-user/${APP_ID}/${invalidHwid}?appSecret=${encodeURIComponent(APP_SECRET)}`;

    const options = {
        hostname: HOST,
        port: PORT,
        path: path,
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(body);
                console.log(`Status: ${res.statusCode}`);
                console.log('Response:', JSON.stringify(response, null, 2));

                if (!response.success) {
                    console.log('\n✅ Correctly rejected invalid HWID!');
                    console.log('   (Check Discord for suspicious HWID log)');
                } else {
                    console.log('\n❌ Unexpectedly accepted invalid HWID!');
                }

                testGetExpiry();
            } catch (e) {
                console.error('Parse error:', e);
                testGetExpiry();
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Error:', e.message);
        testGetExpiry();
    });

    req.end();
}

// ========================================
// TEST 5: Get Expiry by HWID (Valid)
// ========================================
function testGetExpiry() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5: GET /auth/get-expiry/:appId/:hwid (Valid HWID)');
    console.log('='.repeat(60));

    const path = `/auth/get-expiry/${APP_ID}/${TEST_HWID}?appSecret=${encodeURIComponent(APP_SECRET)}`;

    const options = {
        hostname: HOST,
        port: PORT,
        path: path,
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(body);
                console.log(`Status: ${res.statusCode}`);
                console.log('Response:', JSON.stringify(response, null, 2));

                if (response.success) {
                    console.log('\n✅ GetExpiry successful!');
                    console.log(`   Expires At: ${response.expires_at}`);
                    console.log(`   Days Remaining: ${response.days_remaining}`);
                    console.log(`   Is Expired: ${response.is_expired}`);
                    console.log(`   Subscription Type: ${response.subscription_type}`);
                    console.log(`   Level: ${response.level}`);
                } else {
                    console.log('\n❌ GetExpiry failed:', response.message);
                }

                testGetExpiryInvalid();
            } catch (e) {
                console.error('Parse error:', e);
                testGetExpiryInvalid();
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Error:', e.message);
        testGetExpiryInvalid();
    });

    req.end();
}

// ========================================
// TEST 6: Get Expiry by HWID (Invalid - Should Log Suspicious)
// ========================================
function testGetExpiryInvalid() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 6: GET /auth/get-expiry/:appId/:hwid (Invalid HWID - Suspicious)');
    console.log('='.repeat(60));

    const invalidHwid = 'INVALID-HWID-CRACKING-ATTEMPT-999';
    const path = `/auth/get-expiry/${APP_ID}/${invalidHwid}?appSecret=${encodeURIComponent(APP_SECRET)}`;

    const options = {
        hostname: HOST,
        port: PORT,
        path: path,
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(body);
                console.log(`Status: ${res.statusCode}`);
                console.log('Response:', JSON.stringify(response, null, 2));

                if (!response.success) {
                    console.log('\n✅ Correctly rejected invalid HWID!');
                    console.log('   (Check Discord for suspicious HWID log)');
                } else {
                    console.log('\n❌ Unexpectedly accepted invalid HWID!');
                }

                printSummary();
            } catch (e) {
                console.error('Parse error:', e);
                printSummary();
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Error:', e.message);
        printSummary();
    });

    req.end();
}

// ========================================
// SUMMARY
// ========================================
function printSummary() {
    console.log('\\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('All tests completed!');
    console.log('\\nManual Verification Steps:');
    console.log('\\n1. 📂 Check Firebase Storage Console:');
    console.log('   - Should see uploaded file at: payloads/{appId}/TestProduct.exe');
    console.log('\\n2. 💬 Check Discord Logs:');
    console.log('   - logs-apps: Should show payload upload');
    console.log('   - logs-inject: Should show payload download');
    console.log('   - inject (suspicious): Should show 2 invalid HWID attempts');
    console.log('\\n3. 🔍 Check Firestore Console (optional):');
    console.log('   - No new collections needed (uses existing app_keys)');
    console.log('='.repeat(60));
}

// ========================================
// RUN TESTS
// ========================================
console.log('\\n🚀 Starting Loader API Tests...');
console.log(`Target: http://${HOST}:${PORT}`);
console.log(`App ID: ${APP_ID}`);
console.log(`Test Key: ${TEST_KEY}`);
console.log(`Test HWID: ${TEST_HWID}`);
console.log('\\n⚠️  IMPORTANT: Update configuration values before running!');
console.log('⚠️  Make sure you have a valid partner account and test key activated.');

// Wait 2 seconds before starting
setTimeout(() => {
    testPayloadUpload();
}, 2000);
