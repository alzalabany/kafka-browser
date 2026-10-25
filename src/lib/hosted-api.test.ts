import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env,{
  KAFKA_BROWSER_MODE:'hosted',FIREBASE_PROJECT_ID:'demo-kafka-browser',FIREBASE_WEB_API_KEY:'test-key',FIREBASE_AUTH_DOMAIN:'demo-kafka-browser.firebaseapp.com',FIREBASE_WEB_APP_ID:'test-app',
  KAFKA_CREDENTIALS_KEY:Buffer.alloc(32,1).toString('base64'),APP_ORIGIN:'https://kafka.example.com',KAFKA_ALLOWED_HOSTS:'broker.example.com',ALLOWED_EMAIL_DOMAINS:'amanacapital.com',
});
test('every data and Kafka API rejects unauthenticated requests before storage or broker access',async () => {
  const modules=await Promise.all([import('../app/api/connections/route'),import('../app/api/state/route'),import('../app/api/presets/route'),import('../app/api/topics/route'),import('../app/api/stream/route'),import('../app/api/connections/test/route')]);
  for (const route of modules) for (const [method,handler] of Object.entries(route)) {
    if (!['GET','POST','PUT','DELETE'].includes(method) || typeof handler !== 'function') continue;
    const response=await handler(new Request('https://kafka.example.com/api?connection=somebody-elses-id',{method}));
    assert.equal(response.status,401,`${method} must require authentication`);
  }
});
test('session login rejects cross-origin and missing-CSRF requests before token verification',async () => {
  const {POST}=await import('../app/api/auth/route');
  for (const headers of [{Origin:'https://evil.test'},{Origin:'https://kafka.example.com'}]) {
    const response=await POST(new Request('https://kafka.example.com/api/auth',{method:'POST',headers,body:JSON.stringify({idToken:'invalid'})}));
    assert.equal(response.status,403);
  }
});
