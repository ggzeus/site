const http = require('http');

// Test Configuration
const HOST = 'localhost';
const PORT = 80;
const APP_ID = 'YOUR_APP_ID'; // Replace with actual app ID
const TEST_KEY = 'TEST-KEY-123456'; // Replace with actual test key

// Helper function to make HTTP requests
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

// Test 1: POST /auth/hwid
function testHWID() {
    console.log('\n=== Test 1: POST /auth/hwid ===');

    const data = {
        appId: APP_ID,
        key: TEST_KEY,
        hwid: 'TEST-HWID-12345',
        session_id: 'test-session'
    };

    makeRequest('/auth/hwid', 'POST', data, (err, status, response) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return testComponents();
        }

        console.log(`Status: ${status}`);
        console.log('Response:', response);

        if (response.success) {
            console.log('✅ HWID update successful');
        } else {
            console.log('❌ HWID update failed:', response.message);
        }

        testComponents();
    });
}

// Test 2: POST /auth/components
function testComponents() {
    console.log('\n=== Test 2: POST /auth/components ===');

    const data = {
        appId: APP_ID,
        key: TEST_KEY,
        hwid: 'TEST-HWID-12345',
        gpu: 'NVIDIA GeForce RTX 3080',
        motherboard: 'ASUS ROG STRIX B550-F',
        cpu: 'AMD Ryzen 7 5800X',
        session_id: 'test-session'
    };

    makeRequest('/auth/components', 'POST', data, (err, status, response) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return testLoginLog();
        }

        console.log(`Status: ${status}`);
        console.log('Response:', response);

        if (response.success) {
            console.log('✅ Components update successful');
            if (response.previous_components) {
                console.log('Previous components:', response.previous_components);
            }
            console.log('Current components:', response.current_components);
        } else {
            console.log('❌ Components update failed:', response.message);
        }

        testLoginLog();
    });
}

// Test 3: POST /auth/log-login
function testLoginLog() {
    console.log('\n=== Test 3: POST /auth/log-login ===');

    const data = {
        appId: APP_ID,
        username_or_key: TEST_KEY,
        hwid: 'TEST-HWID-12345',
        session_id: 'test-session'
    };

    makeRequest('/auth/log-login', 'POST', data, (err, status, response) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return testAutoUserCreation();
        }

        console.log(`Status: ${status}`);
        console.log('Response:', response);

        if (response.success) {
            console.log('✅ Login log successful');
        } else {
            console.log('❌ Login log failed:', response.message);
        }

        testAutoUserCreation();
    });
}

// Test 4: POST /auth/license (Auto-user creation)
function testAutoUserCreation() {
    console.log('\n=== Test 4: POST /auth/license (Auto-user creation) ===');
    console.log('Note: This test requires a valid unused key in the database');

    const data = {
        appId: APP_ID,
        key: TEST_KEY,
        hwid: 'TEST-HWID-NEW-USER',
        session_id: 'test-session'
    };

    makeRequest('/auth/license', 'POST', data, (err, status, response) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return printSummary();
        }

        console.log(`Status: ${status}`);
        console.log('Response:', response);

        if (response.success) {
            console.log('✅ License activation successful');
            console.log('Check Firebase Console for auto-created user in app_users collection');
        } else {
            console.log('❌ License activation failed:', response.message);
        }

        printSummary();
    });
}

function printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('All tests completed!');
    console.log('\nManual Verification Steps:');
    console.log('1. Check Firebase Console > app_keys collection');
    console.log('   - Verify hwid and components fields are updated');
    console.log('2. Check Firebase Console > app_login_logs collection');
    console.log('   - Verify login entries were created');
    console.log('3. Check Firebase Console > app_users collection');
    console.log('   - Verify auto-created user exists (if key was unused)');
    console.log('='.repeat(50));
}

// Run tests
console.log('Starting Auth API Tests...');
console.log(`Target: http://${HOST}:${PORT}`);
console.log(`App ID: ${APP_ID}`);
console.log(`Test Key: ${TEST_KEY}`);
console.log('\n⚠️  Make sure to update APP_ID and TEST_KEY before running!');

testHWID();
