# External API Documentation

## Ticket Status Lookup API

This endpoint allows external systems to query ticket status information using the ticket ID.

### Endpoint

```
GET /api/external/ticket-status/:ticketId
```

### Parameters

- `ticketId` (path parameter): The unique identifier of the ticket

### Authentication

This endpoint is **public** and does not require authentication.

### Response Format

#### Success Response (200)

```json
{
  "success": true,
  "ticket": {
    "id": 123,
    "ticket_id": "TKT-2024-001",
    "status": "Open",
    "category": "Complaint",
    "complaint_type": "Minor",
    "subject": "Service inquiry",
    "phone_number": "255123456789",
    "region": "Dar es Salaam",
    "responsible_unit": "Customer Service",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T14:45:00.000Z",
    "age_in_days": 5,
    "current_assignee": {
      "id": 456,
      "name": "John Doe",
      "role": "agent"
    },
    "last_assignment": {
      "assigned_at": "2024-01-15T11:00:00.000Z",
      "assigned_to": {
        "id": 456,
        "name": "John Doe",
        "role": "agent"
      }
    }
  },
  "timestamp": "2024-01-20T15:30:00.000Z"
}
```

#### Error Responses

**400 Bad Request - Missing Ticket ID**
```json
{
  "success": false,
  "message": "Ticket ID is required",
  "error": "MISSING_TICKET_ID"
}
```

**404 Not Found - Ticket Not Found**
```json
{
  "success": false,
  "message": "Ticket not found",
  "error": "TICKET_NOT_FOUND",
  "ticket_id": "123"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "INTERNAL_ERROR"
}
```

### Example Usage

#### cURL
```bash
curl -X GET "http://your-domain.com/api/external/ticket-status/123"
```

#### JavaScript (Fetch)
```javascript
const response = await fetch('http://your-domain.com/api/external/ticket-status/123');
const data = await response.json();

if (data.success) {
  console.log('Ticket Status:', data.ticket.status);
  console.log('Assigned To:', data.ticket.current_assignee?.name);
} else {
  console.error('Error:', data.message);
}
```

#### Python (requests)
```python
import requests

response = requests.get('http://your-domain.com/api/external/ticket-status/123')
data = response.json()

if data['success']:
    print(f"Ticket Status: {data['ticket']['status']}")
    print(f"Assigned To: {data['ticket']['current_assignee']['name'] if data['ticket']['current_assignee'] else 'Unassigned'}")
else:
    print(f"Error: {data['message']}")
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Internal ticket ID |
| `ticket_id` | string | Human-readable ticket ID |
| `status` | string | Current ticket status (Open, Assigned, In Progress, Closed, etc.) |
| `category` | string | Ticket category (Complaint, Inquiry, etc.) |
| `complaint_type` | string | Complaint rating (Minor, Major) |
| `subject` | string | Ticket subject/description |
| `phone_number` | string | Contact phone number |
| `region` | string | Geographic region |
| `responsible_unit` | string | Responsible department/unit |
| `created_at` | string | Ticket creation timestamp |
| `updated_at` | string | Last update timestamp |
| `age_in_days` | number | Days since ticket creation |
| `current_assignee` | object | Currently assigned user (null if unassigned) |
| `last_assignment` | object | Most recent assignment details |

### Rate Limiting

This endpoint is designed for external system integration. Please implement appropriate rate limiting on your client side to avoid overwhelming the server.

### Security Notes

- This endpoint is public and accessible without authentication
- Only basic ticket information is exposed (no sensitive personal data)
- Consider implementing IP-based rate limiting if needed
- Monitor usage for potential abuse 