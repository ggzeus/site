const http = require('http');

function postComment() {
    const data = JSON.stringify({
        topicId: 'auth-error',
        userId: 1, // Assuming admin user
        username: 'zeus',
        message: 'Teste de comentário via script'
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/comments',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log(`POST /comments Status: ${res.statusCode}`);
            console.log(`POST Body: ${body}`);
            getComments(); // Chain GET request
        });
    });

    req.on('error', (e) => {
        console.error(`PROBABLE ROOT CAUSE: Server not reachable or crashing. Error: ${e.message}`);
    });

    req.write(data);
    req.end();
}

function getComments() {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/comments/auth-error',
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log(`GET /comments/:id Status: ${res.statusCode}`);
            console.log(`GET Body: ${body}`);
        });
    });

    req.on('error', (e) => {
        console.error(`PROBABLE ROOT CAUSE: Server not reachable or crashing. Error: ${e.message}`);
    });

    req.end();
}

console.log("Starting API Test...");
postComment();
