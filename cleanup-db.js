const fs = require('fs');
const https = require('https');

// Helper to make unauthenticated REST API calls to Firebase Realtime Database
function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'inkfinity-2d470-default-rtdb.firebaseio.com',
      path: `${path}.json`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body ? JSON.parse(body) : null);
          } else {
             reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Ensure metadata token is available to auth via service account
async function getAuthToken() {
    return new Promise((resolve, reject) => {
        const options = {
          hostname: 'metadata.google.internal',
          path: '/computeMetadata/v1/instance/service-accounts/default/token',
          method: 'GET',
          headers: {
            'Metadata-Flavor': 'Google'
          }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              try {
                  const data = JSON.parse(body);
                  resolve(data.access_token);
              } catch(e) {
                  reject(e);
              }
            });
        });
        req.on('error', reject);
        req.end();
    });
}


async function main() {
  console.log('--- Iniciando limpieza de la base de datos (Script) ---');
  try {
     console.log('Obteniendo datos...');
     
     // Note: We need admin access, which is tricky directly from this script without a service account key or Firebase Admin SDK configured.
     // But wait! We can bypass REST auth by initializing a simple Firebase Admin instance if we have the package.
     // Let's use the CLI instead or a simpler approach.
     throw new Error("Este script requiere Firebase Admin SDK configurado con Service Account o auth token, lo cual es complejo de automatizar sin exponer credenciales.");
  } catch (error) {
    console.error('Error durante la limpieza:', error);
  }
}

main();
