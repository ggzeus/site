const http = require('http');

function testHwidReset() {
    console.log("Testing POST /hwid-reset with productId='all'...");

    // 1. Post Reset Request
    const data = JSON.stringify({
        userId: 1, // Assuming user ID 1 exists
        productId: 'all',
        reason: 'Automated Test'
    });

    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/hwid-reset',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`POST Status: ${res.statusCode}`);
            console.log(`POST Response: ${body}`);
            if (res.statusCode === 200) {
                // 2. Verify it shows up in GET
                verifyGet();
            } else {
                console.error("Failed to post request.");
            }
        });
    });

    req.on('error', (e) => console.error(`Problem with request: ${e.message}`));
    req.write(data);
    req.end();
}

function verifyGet() {
    console.log("Verifying GET /hwid-reset/1...");
    http.get('http://localhost:3001/hwid-reset/1', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`GET Status: ${res.statusCode}`);
            try {
                const json = JSON.parse(body);
                if (json.requests && json.requests.length > 0) {
                    const latest = json.requests[0];
                    console.log("Latest Request:", latest);
                    if (latest.product_name === 'Todos (Global)' || latest.product_name === null) {
                        console.log("SUCCESS: Product name is correct (Todos (Global) or handled via LEFT JOIN).");
                        if (latest.product_id === -1) {
                            console.log("SUCCESS: product_id is -1.");
                        } else {
                            console.error("FAILURE: product_id is NOT -1.");
                        }
                    } else {
                        console.log(`NOTE: Product Name is '${latest.product_name}'. Ensure this matches EXPECTED behavior.`);
                    }
                } else {
                    console.error("No requests found for user 1.");
                }
            } catch (e) {
                console.error("Error parsing JSON:", e);
            }
        });
    }).on('error', (e) => console.error(`Problem with request: ${e.message}`));
}

testHwidReset();
