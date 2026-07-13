<<<<<<< HEAD
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
  const macAppUrl = 'https://democc.wcf.go.tz/';
  const url = `${macAppUrl}login_redirect?token=${encodeURIComponent(encryptedToken)}`;

  console.log('🔐 Encrypted Token:', encryptedToken);
  console.log('🌐 Redirect URL:', url);

  await open.default(url); // ✅ call open.default because it's the default export

})();



=======
const crypto = require('crypto');
const readline = require('readline');
const { Client } = require('ldapts');
require('dotenv').config();

// LDAP Authentication function (same as in authController)
async function authenticateActiveDirectory(username, password) {
  const url = "ldap://192.168.1.15";
  const baseDN = "dc=wcf,dc=go,dc=tz";
  const bindDN = `WCF\\${username}`;
  const client = new Client({ url });

  try {
    // LDAP bind (authenticate user)
    await client.bind(bindDN, password);
    console.log(`✅ LDAP authentication successful for ${username}`);

    // LDAP search for user
    const { searchEntries } = await client.search(baseDN, {
      scope: "sub",
      filter: `(sAMAccountName=${username})`,
      attributes: ["employeeID", "mail"],
    });

    if (searchEntries.length === 0) {
      throw new Error("User not found in LDAP.");
    }

    const ldapUser = searchEntries[0];
    return ldapUser; // Successfully found user in Active Directory
  } catch (error) {
    console.error("❌ LDAP error:", error.message);
    throw new Error("Failed to authenticate user in Active Directory.");
  } finally {
    await client.unbind();
  }
}

// Function to prompt for user input
function promptInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Function to prompt for password (hidden input)
function promptPassword(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    // Hide password input (works on most terminals)
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  });
}

function encryptWithOpenSSL(payload) {
  const keyString = process.env.ENCRYPTION_KEY || 'yN!VkiK9#-GoUwB@eUD8l~zoY@3ccVmx';
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

(async () => {
  try {
    const open = await import('open');

    console.log('🔐 MAC Login - Active Directory Authentication');
    console.log('==============================================\n');

    // Prompt for LDAP username
    const username = await promptInput('Enter your LDAP username: ');
    if (!username || username.trim() === '') {
      console.error('❌ Username is required');
      process.exit(1);
    }

    // Prompt for LDAP password
    const password = await promptInput('Enter your LDAP password: ');
    if (!password || password.trim() === '') {
      console.error('❌ Password is required');
      process.exit(1);
    }

    console.log('\n🔍 Authenticating with Active Directory...');

    // Authenticate with LDAP
    try {
      await authenticateActiveDirectory(username.trim(), password);
      console.log('✅ Authentication successful!\n');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      process.exit(1);
    }

    // Prompt for optional notification_report_id
    const notification_report_id = await promptInput('Enter notification_report_id (optional, press Enter to skip): ');
    
    // Prompt for optional employer_id
    const employer_id_input = await promptInput('Enter employer_id (optional, press Enter to skip): ');
    const employer_id = employer_id_input && employer_id_input.trim() !== '' 
      ? parseInt(employer_id_input.trim()) 
      : '';

    // Prepare payload with authenticated username
    const payload = {
      username: username.trim(),
      notification_report_id: notification_report_id.trim() || '',
      employer_id: employer_id || '',
    };

    console.log('\n🔐 Encrypting credentials...');
    const encryptedToken = encryptWithOpenSSL(payload);
    
    const macAppUrl = process.env.MAC_APP_URL || 'https://mac.wcf.go.tz/';
    const url = `${macAppUrl}login_redirect?token=${encodeURIComponent(encryptedToken)}`;

    console.log('✅ Encrypted Token:', encryptedToken);
    console.log('🌐 Redirect URL:', url);
    console.log('\n🚀 Opening MAC application...\n');

    await open.default(url);
    
    console.log('✅ MAC login initiated successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();


>>>>>>> 6bb9b454451e06634fcd59b0c53655224fa81b51

