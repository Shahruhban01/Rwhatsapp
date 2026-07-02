const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
const https = require('https');

dotenv.config({ path: path.join(__dirname, '.env') });

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function run() {
  try {
    console.log("Generating custom token for user 'test-user-123'...");
    const customToken = await admin.auth().createCustomToken('test-user-123');
    console.log("Custom token generated successfully!");

    const webDotenv = dotenv.config({ path: path.join(__dirname, '../web/.env') }).parsed || {};
    const apiKey = webDotenv.VITE_FIREBASE_API_KEY || "AIzaSyB3A7DqEA5pz6PHMGhiJDPrMaYrpW_bVSA";

    console.log(`Sending token to Google Identity Toolkit with API Key: ${apiKey}...`);
    
    const postData = JSON.stringify({
      token: customToken,
      returnSecureToken: true
    });

    const options = {
      hostname: 'identitytoolkit.googleapis.com',
      port: 443,
      path: `/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`Response Status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          console.log("Response Body:", JSON.stringify(parsed, null, 2));
        } catch {
          console.log("Response Body (Raw):", data);
        }
      });
    });

    req.on('error', (e) => {
      console.error("Request Error:", e.message);
    });

    req.write(postData);
    req.end();

  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
