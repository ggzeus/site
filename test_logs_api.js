const http = require('http');

// Test Configuration
const HOST = 'localhost';
const PORT = 80;
const APP_ID = 'YOUR_APP_ID';
const TEST_KEY = 'LOGS-TEST-KEY-' + Date.now();

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

function runTests() {
    console.log('Starting Logs API Tests...');

    // NOTE: This test works best if you have a valid App ID. 
    // Using placeholder might result in 404/500 if DB logic is strict about App ID existence for logging.
    // However, SendLogLogin usually just inserts.
    const appId = 'application_id_placeholder';
    const key = TEST_KEY;

    // 1. Log Login with Components
    const loginData = {
        appId: appId,
        username_or_key: key,
        hwid: 'TEST-HWID-' + Date.now(),
        components: {
            gpu: 'NVIDIA RTX 4090 Test',
            cpu: 'Intel i9-13900K Test',
            motherboard: 'Z790 Test'
        }
    };

    console.log(`\n1. Sending Log Login for ${key}...`);
    makeRequest('/auth/log-login', 'POST', loginData, (err, status, res) => {
        if (err) { console.error('Error:', err); return; }
        console.log(`Status: ${status}`, res);

        // 2. Get Logs (Page 1, Limit 1)
        console.log(`\n2. Fetching Logs for App ${appId} (Page 1, Limit 1)...`);
        makeRequest(`/api/app/${appId}/logs?page=1&limit=1`, 'GET', {}, (err, status, res) => {
            if (err) { console.error('Error:', err); return; }
            console.log(`Status: ${status}`);
            console.log(`HasMore: ${res.hasMore}, Logs Count: ${res.logs ? res.logs.length : 0}`);

            if (res.logs && res.logs.length === 1 && res.hasMore !== undefined) {
                console.log('✅ Pagination structure valid.');
            } else {
                console.log('❌ Pagination structure invalid.');
            }

            // 3. Get Logs (Normal)
            console.log(`\n3. Fetching Logs Normal (Limit 20)...`);
            makeRequest(`/api/app/${appId}/logs?page=1&limit=20`, 'GET', {}, (err, status, res) => {
                if (res.logs && res.logs.length > 0) {
                    const myLog = res.logs.find(l => l.key_or_username === key);
                    if (myLog) {
                        console.log('✅ Found our log entry!');
                        console.log('Components:', myLog.components);
                        if (myLog.components && myLog.components.gpu === 'NVIDIA RTX 4090 Test') {
                            console.log('✅ Components match!');
                        }
                    }
                } else {
                    console.log('❌ No logs found in normal fetch.');
                }
            });
        });
    });
}

runTests();
