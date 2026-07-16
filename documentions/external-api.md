# External API Documentation

APIs for external systems (ESSP portal, WCF portal, etc.) to interact with the contact center.

**Production**

- ESSP create ticket: `https://contactcenter.wcf.go.tz/api/essp`
- External ticket status: `https://contactcenter.wcf.go.tz/api/external`

**Demo / staging (internal DNS or hosts file)**

- ESSP create ticket: `https://contactcenter.wcf.go.tz/api/essp`
- External ticket status: `https://contactcenter.wcf.go.tz/api/external`

> `contactcenter.wcf.go.tz` is on the WCF internal network (typically `192.168.21.69`). Use VPN/office DNS, or map the host locally (see below) before calling with curl.

---

## Authentication (create-ticket)

Ticket creation requires an API key:

| Header | Value |
|--------|--------|
| `x-api-key` | Your assigned API key |
| or `Authorization` | `Bearer <your-api-key>` |

Configure keys on the server:

```env
VALID_API_KEYS=essp-prod-key-here,essp-staging-key-here
ALLOWED_ORIGINS=https://essp.wcf.go.tz,https://portal.wcf.go.tz
```

**Ticket status lookup** (`POST /api/external/ticket-status`) does not require an API key but is rate-limited and CORS-restricted.

---

## Create Ticket (ESSP)

Allows the Employee Self Service Portal to create contact-center tickets.

### Endpoint

```
POST /api/essp/create-ticket
```

### Headers

```
Content-Type: application/json
x-api-key: YOUR_ESSP_API_KEY
```

### Request body

Wrap fields in a `payload` object (recommended) or send flat JSON.

| Field | Required | Description |
|-------|----------|-------------|
| `phoneNumber` | Yes | Requester phone (e.g. `255684012920`) |
| `requester` | Yes | e.g. `Employee`, `Employer` |
| `category` | Yes | `Inquiry`, `Complaint`, `Suggestion`, `Compliment`, `Congrats` |
| `subject` | Yes | Ticket subject |
| `description` | Yes | Ticket description |
| `firstName`, `middleName`, `lastName` | No | Requester names |
| `nidaNumber` | No | NIDA number |
| `institution`, `channel`, `region`, `district` | No | Defaults: `channel` → `ESSP` if omitted |
| `functionId`, `responsible_unit_id`, `responsible_unit_name` | No | Routing / unit |
| `section`, `sub_section` | No | Section labels |
| `inquiry_type` | No | `Claims` or `Compliance` |
| `status`, `shouldClose` | No | Default `Open` |
| `employerAllocatedStaffUsername` | No | Assign to this WCF user when provided (ESSP priority) |
| `employerRegistrationNumber`, `employerName`, etc. | No | Employer details |
| `requesterName`, `requesterEmail`, `requesterPhoneNumber`, `requesterAddress` | No | Stored in RequesterDetails when provided |
| `relationshipToEmployee` | No | e.g. `Self` |

### Example request

```json
{
  "payload": {
    "firstName": "MARIKI",
    "middleName": "EDWARD",
    "lastName": "MSAKI",
    "phoneNumber": "255684012920",
    "nidaNumber": "19830622114700000121",
    "requester": "Employee",
    "institution": "Workers Compensation Fund (WCF)",
    "channel": "ESSP",
    "category": "Complaint",
    "inquiry_type": "Compliance",
    "functionId": 15,
    "responsible_unit_id": 15,
    "responsible_unit_name": "Compliance",
    "section": "Compliance",
    "subject": "Compliance enquiry",
    "description": "Test message",
    "status": "Open",
    "shouldClose": false,
    "requesterName": "MARIKI EDWARD MSAKI",
    "requesterPhoneNumber": "255684012920",
    "requesterEmail": "mariki.msaki@wcf.go.tz",
    "relationshipToEmployee": "Self",
    "employerRegistrationNumber": "4038",
    "employerName": "Workers Compensation Fund (WCF)",
    "employerAllocatedStaffUsername": "mariam.mlilapi",
    "is_new_registration": false
  }
}
```

### Success response (201)

```json
{
  "success": true,
  "message": "Ticket created successfully and assigned to Mariam Mlilapi",
  "ticket_id": "WCF-CC-20260526-000001",
  "ticket": { },
  "assigned_to": {
    "id": "...",
    "full_name": "Mariam Mlilapi",
    "role": "focal-person"
  }
}
```

### Error responses

| Status | error | When |
|--------|-------|------|
| 400 | `VALIDATION_ERROR` | Missing required fields |
| 400 | `ALLOCATED_USER_NOT_FOUND` | `employerAllocatedStaffUsername` not in system |
| 400 | `NO_ASSIGNEE_FOUND` | No reviewer/focal-person for category |
| 401 | `MISSING_API_KEY` | No API key header |
| 401 | `INVALID_API_KEY` | Wrong key |
| 500 | `SYSTEM_USER_NOT_CONFIGURED` | `system` user missing in DB |
| 500 | `API_KEYS_NOT_CONFIGURED` | `VALID_API_KEYS` env empty |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |

### cURL example (production)

```bash
curl -X POST "https://contactcenter.wcf.go.tz/api/essp/create-ticket" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ESSP_API_KEY" \
  -d '{
    "payload": {
      "firstName": "MARIKI",
      "lastName": "MSAKI",
      "phoneNumber": "255684012920",
      "requester": "Employee",
      "category": "Complaint",
      "subject": "Compliance enquiry",
      "description": "Test message",
      "employerAllocatedStaffUsername": "mariam.mlilapi"
    }
  }'
```

### cURL example (demo — `contactcenter.wcf.go.tz`)

1. **Resolve the host** (pick one):
   - Connect to WCF VPN / use internal DNS, or
   - On your Mac, add to `/etc/hosts`: `192.168.21.69 contactcenter.wcf.go.tz`
2. **Call the API** (use `-k` only if the demo server uses a self-signed TLS certificate):

```bash
curl -k -X POST "https://contactcenter.wcf.go.tz/api/essp/create-ticket" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ESSP_API_KEY" \
  -d '{
    "payload": {
      "firstName": "MARIKI",
      "lastName": "MSAKI",
      "phoneNumber": "255684012920",
      "requester": "Employee",
      "category": "Complaint",
      "subject": "Compliance enquiry",
      "description": "Test message",
      "employerAllocatedStaffUsername": "mariam.mlilapi"
    }
  }'
```

Ensure `VALID_API_KEYS` on the **contactcenter server** includes the same key you send in `x-api-key`.

### Assignment rules (ESSP)

1. If `employerAllocatedStaffUsername` is set → assign to that user (any category).
2. Otherwise same rules as contact center: Inquiry → allocated user / focal-person; Complaint → reviewer.
3. Complaints without `complaint_type` default to `Minor`.

---

## Ticket Status Lookup

Query ticket status by phone number and/or ticket number.

### Endpoint

```
POST /api/external/ticket-status
```

### Request body

```json
{
  "phone_number": "255123456789",
  "ticket_number": "WCF-CC-20251226-000002"
}
```

At least one of `phone_number` or `ticket_number` is required.

### Success response (200)

```json
{
  "success": true,
  "total_tickets": 1,
  "tickets": [
    {
      "ticket_number": "WCF-CC-20251226-000002",
      "status": "Open",
      "category": "Complaint",
      "subject": "Service inquiry",
      "phone_number": "255123456789",
      "age_in_days": 5,
      "current_assignee": {
        "id": "...",
        "name": "John Doe",
        "role": "reviewer"
      }
    }
  ]
}
```

### Rate limiting

- **100 requests per 15 minutes** per IP on external routes.

### Security notes

- Create-ticket requires a valid API key (`VALID_API_KEYS`).
- CORS allows configured origins (`ALLOWED_ORIGINS` / defaults include `https://essp.wcf.go.tz`).
- Status lookup is public but rate-limited; do not expose sensitive data in client logs.
