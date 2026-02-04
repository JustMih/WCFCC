const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key is required (use ticket number or phone number)',
      error: 'MISSING_API_KEY'
    });
  }
  
  // Remove 'Bearer ' prefix if present
  const cleanApiKey = apiKey.replace('Bearer ', '');
  
  // Convert phone number format if it starts with 0
  let processedApiKey = cleanApiKey;
  if (cleanApiKey.startsWith('0') && cleanApiKey.length === 10) {
    processedApiKey = '255' + cleanApiKey.substring(1);
  }
  
  // Store the processed API key (ticket number or phone number) in request for later use
  req.apiKey = processedApiKey;
  
  next();
};

module.exports = apiKeyAuth; 