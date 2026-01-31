const crypto = require('crypto');

(async () => {
  const open = await import('open'); // <-- ✅ Use dynamic import here

  function encryptWithOpenSSL(payload) {
    const keyString = 'yN!VkiK9#-GoUwB@eUD8l~zoY@3ccVmx'; // 32-char key (removed 'x')
    const key = Buffer.from(keyString, 'utf8');

    if (key.length !== 32) {
      throw new Error(`ENCRYPTION_KEY must be exactly 32 bytes. Got ${key.length} bytes.`);
    }

    const plainText = JSON.stringify(payload);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const ivBase64 = iv.toString('base64');
    const combined = `${encrypted}::${ivBase64}`;
    return Buffer.from(combined, 'utf8').toString('base64');
  }

  const payload = {
    username: 'mmsaki-admin',
    notification_report_id:'',
    employer_id: 13952,
  };

  const encryptedToken = encryptWithOpenSSL(payload);
  const macAppUrl = 'https://demomac.wcf.go.tz/';
  const url = `${macAppUrl}login_redirect?token=${encodeURIComponent(encryptedToken)}`;

  console.log('🔐 Encrypted Token:', encryptedToken);
  console.log('🌐 Redirect URL:', url);

  await open.default(url); // ✅ call open.default because it's the default export

})();



