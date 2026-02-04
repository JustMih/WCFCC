# Claim Redirect Integration Guide

## 🎯 **What We've Built**

I've successfully integrated the login redirect functionality into your "View Claim" button. Now when users click the button, it will:

1. **Call your backend API** with the claim number
2. **Encrypt the data** using your backend encryption
3. **Generate a MAC app URL** with the encrypted token
4. **Open the MAC application** in a new tab

## 📁 **Files Created/Modified**

### Backend Files (Already Done)
- ✅ `controllers/auth/authController.js` - Added `loginRedirect` function
- ✅ `routes/authRoutes.js` - Added `POST /api/auth/login_redirect` route
- ✅ `config/mysql_connection.js` - Fixed database connection

### Frontend Files (New)
- ✅ `wcf_final/src/components/ticket/ClaimRedirectButton.jsx` - Reusable button component
- ✅ `wcf_final/src/components/ticket/ClaimRedirectExample.jsx` - Usage examples
- ✅ `wcf_final/src/components/ticket/AdvancedTicketCreateModal.js` - Updated with new button

## 🔧 **How It Works**

### 1. User Clicks "View Claim in MAC" Button
```jsx
<ClaimRedirectButton 
  claimNumber={17065}
  employerId=""
  buttonText="View Claim in MAC"
/>
```

### 2. Frontend Makes API Call
```javascript
// Calls: POST /api/auth/login_redirect
{
  notification_report_id: 17065,
  employer_id: ""
}
```

### 3. Backend Processes Request
```javascript
// Your backend:
// 1. Gets user from JWT token
// 2. Creates auth_data object
// 3. Encrypts with OpenSSL
// 4. Returns MAC app URL
```

### 4. MAC App Opens
```javascript
// Frontend opens: https://demomac.wcf.go.tz/login_redirect?token=encrypted_data
window.open(response.data.success.url, '_blank');
```

## 🚀 **Usage Examples**

### Basic Usage
```jsx
import ClaimRedirectButton from './ClaimRedirectButton';

<ClaimRedirectButton 
  claimNumber={17065}
  employerId=""
/>
```

### With Custom Styling
```jsx
<ClaimRedirectButton 
  claimNumber={17065}
  employerId=""
  buttonText="Process in MAC"
  style={{
    backgroundColor: '#4caf50',
    fontSize: '16px'
  }}
/>
```

### With Success/Error Callbacks
```jsx
<ClaimRedirectButton 
  claimNumber={17065}
  employerId=""
  onSuccess={(data) => {
    console.log('Success:', data);
    // Show success notification
  }}
  onError={(error) => {
    console.error('Error:', error);
    // Show error notification
  }}
/>
```

### In a List of Claims
```jsx
{claims.map(claim => (
  <div key={claim.id}>
    <span>Claim #{claim.number}</span>
    <ClaimRedirectButton 
      claimNumber={claim.number}
      employerId={claim.employer_id}
      buttonText="View"
    />
  </div>
))}
```

## ⚙️ **Configuration Required**

### Backend Environment Variables
Add to your `.envt` file:
```env
MAC_APP_URL="https://demomac.wcf.go.tz/"
ENCRYPTION_KEY="your-secret-key-32-chars-long!!"
```

### Frontend Environment Variables
Add to your frontend `.env` file:
```env
REACT_APP_API_URL=http://localhost:5070
```

## 🔍 **Testing**

### 1. Test the Backend API
```bash
curl -X POST http://localhost:5070/api/auth/login_redirect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "notification_report_id": 17065,
    "employer_id": ""
  }'
```

### 2. Test the Frontend Component
Use the `ClaimRedirectExample` component:
```jsx
import ClaimRedirectExample from './ClaimRedirectExample';

function TestPage() {
  return <ClaimRedirectExample />;
}
```

## 🛠️ **Troubleshooting**

### Common Issues:

1. **"No authentication token found"**
   - Make sure user is logged in
   - Check if token is stored in localStorage/sessionStorage

2. **"Connection refused"**
   - Ensure backend is running on port 5070
   - Check if API endpoint is accessible

3. **"Invalid response format"**
   - Verify backend returns correct JSON structure
   - Check if encryption is working properly

4. **MAC app doesn't open**
   - Verify MAC_APP_URL is correct
   - Check if the URL is accessible from your browser

## 📋 **API Response Format**

### Success Response
```json
{
  "success": {
    "message": "Continue on MAC!",
    "url": "https://demomac.wcf.go.tz/login_redirect?token=encrypted_data"
  }
}
```

### Error Response
```json
{
  "message": "Error description"
}
```

## 🎨 **Customization Options**

### Button Props
- `claimNumber` - The claim/notification report ID
- `employerId` - Employer ID (optional)
- `buttonText` - Custom button text
- `className` - CSS classes
- `style` - Inline styles
- `onSuccess` - Success callback function
- `onError` - Error callback function

### Styling Examples
```jsx
// Blue button (default)
<ClaimRedirectButton claimNumber={17065} />

// Green button
<ClaimRedirectButton 
  claimNumber={17065}
  style={{ backgroundColor: '#4caf50' }}
/>

// Small button
<ClaimRedirectButton 
  claimNumber={17065}
  style={{ fontSize: '12px', padding: '6px 12px' }}
/>
```

## 🔐 **Security Features**

- ✅ JWT token authentication
- ✅ Automatic token inclusion in requests
- ✅ Encrypted data transmission
- ✅ Error handling for unauthorized access
- ✅ Token cleanup on authentication failures

## 📞 **Support**

If you encounter any issues:

1. Check the browser console for errors
2. Verify backend logs for API errors
3. Ensure all environment variables are set
4. Test the API endpoint directly
5. Verify the MAC app URL is accessible

The integration is now complete and ready for production use! 🎉 