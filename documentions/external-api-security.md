# External API Security Documentation

## Overview
This document outlines the security measures implemented for the external API endpoints.

## Security Features

### 1. API Key Authentication
- **Header**: `x-api-key` or `Authorization: Bearer <api-key>`
- **Purpose**: Ensures only authorized systems can access the API
- **Configuration**: Set `VALID_API_KEYS` in environment variables

### 2. Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP
- **Purpose**: Prevents abuse and ensures fair usage
- **Headers**: Returns `RateLimit-*` headers

### 3. CORS Protection
- **Purpose**: Controls which domains can access the API
- **Configuration**: Set `ALLOWED_ORIGINS` in environment variables

### 4. Input Validation
- **Phone Number**: Must be valid mobile number format
- **Ticket ID**: Alphanumeric with hyphens/underscores, 1-50 characters
- **Purpose**: Prevents injection attacks and ensures data integrity

## Usage Examples

### With API Key
```bash
curl -X POST http://your-api-url/api/external/ticket-status \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secure-api-key-here" \
  -d '{"ticket_id": "WCF-CC-689993"}'
```

### With Bearer Token
```bash
curl -X POST http://your-api-url/api/external/ticket-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-api-key-here" \
  -d '{"phone_number": "255123456789"}'
```

## Error Responses

### Missing API Key
```json
{
  "success": false,
  "message": "API key is required",
  "error": "MISSING_API_KEY"
}
```

### Invalid API Key
```json
{
  "success": false,
  "message": "Invalid API key",
  "error": "INVALID_API_KEY"
}
```

### Rate Limit Exceeded
```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later.",
  "error": "RATE_LIMIT_EXCEEDED"
}
```

### Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "type": "field",
      "value": "invalid-phone",
      "msg": "Phone number must be a valid mobile number",
      "path": "phone_number",
      "location": "body"
    }
  ]
}
```

## Environment Variables

```bash
# Required for API key authentication
VALID_API_KEYS=your-secure-api-key-here,another-api-key-here

# Required for CORS protection
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Optional rate limiting configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Security Best Practices

1. **Use HTTPS**: Always use HTTPS in production
2. **Rotate API Keys**: Regularly rotate API keys
3. **Monitor Usage**: Monitor API usage for suspicious activity
4. **Log Requests**: Log all API requests for audit purposes
5. **Update Dependencies**: Keep all dependencies updated
6. **Input Sanitization**: Always validate and sanitize inputs
7. **Error Handling**: Don't expose sensitive information in error messages 