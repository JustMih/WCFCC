const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');

const sendQuickSms = async ({ message, recipient }) => {
  const CLIENT_KEY = 'q7SGoJ8DJAWJz2YlZABF9VMVlVyp7ePMYdeB555na';
  const USER_ID = 'samwel.nzunda@wcf.go.tz';
  const REQUEST_SOURCE = 'api';
  const ENDPOINT = 'https://mgov.gov.go.tz/gateway/sms/quick_sms';

  const datetime = moment().format('YYYY-MM-DD HH:mm:ss');
  const payload = {
    message: message,
    datetime: datetime,
    sender_id: 'WCF',
    mobile_service_id: '222',
    recipients: recipient
  };

  const requestData = JSON.stringify(payload);

  // Debug logs for comparison with Laravel
  console.log('SMS Payload String:', requestData);
  const generatedHash = generateRequestHash(requestData, CLIENT_KEY);
  console.log('Generated Hash:', generatedHash);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Auth-Request-Hash': generatedHash,
    'X-Auth-Request-Id': USER_ID,
    'X-Auth-Request-Type': REQUEST_SOURCE
  };

  try {
    const response = await axios.post(ENDPOINT, new URLSearchParams({ data: requestData, datetime }), { headers });
    console.log('SMS Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('SMS Error:', error.response?.data || error.message);
    return null;
  }
};

const generateRequestHash = (data, clientKey) => {
  const hmac = crypto.createHmac('sha256', clientKey);
  hmac.update(data);
  return Buffer.from(hmac.digest()).toString('base64');
};

module.exports = { sendQuickSms }; 