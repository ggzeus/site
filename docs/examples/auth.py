import requests
import json
import hashlib
import platform
import uuid

API_URL = "http://localhost/auth"  # Change to your server URL

class ScarletAuth:
    def __init__(self, name, owner_id, secret, version):
        self.name = name
        self.owner_id = owner_id
        self.secret = secret
        self.version = version
        self.session_id = None
        self.app_id = "" # Will be fetched or hardcoded

    def init(self):
        data = {
            "name": self.name,
            "ownerId": self.owner_id,
            "secret": self.secret,
            "version": self.version
        }
        res = requests.post(f"{API_URL}/init", json=data)
        if res.status_code == 200:
            j = res.json()
            if j['success']:
                self.session_id = j['session_id']
                print(f"Initialized! Session: {self.session_id}")
                return True
        print(f"Init Error: {res.text}")
        return False

    def login(self, username, password):
        if not self.session_id:
            print("Not initialized")
            return
        
        # Get HWID (Simple example)
        hwid = str(uuid.getnode())

        data = {
            "username": username,
            "password": password,
            "session_id": self.session_id,
            "hwid": hwid,
            "appId": "YOUR_APP_ID_HERE" # Need to know App ID
        }
        # Note: In real logic, AppId usually comes from Init or is hardcoded constant
        
        res = requests.post(f"{API_URL}/login", json=data)
        print(res.json())

# Usage
auth = ScarletAuth("MyApp", "Owner123", "SecretKey", "1.0")
auth.init()
# auth.login("user", "pass")
