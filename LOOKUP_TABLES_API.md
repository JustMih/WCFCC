# Lookup Tables API Documentation

This document describes the API endpoints for managing lookup tables in the WCF Call Center system.

## Base URL
All endpoints are prefixed with `/lookup-tables`

## Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Report To Management

### Get All Report To Entries
```
GET /lookup-tables/report-to
```

### Get Report To Entry by ID
```
GET /lookup-tables/report-to/:id
```

### Create Report To Entry
```
POST /lookup-tables/report-to
Content-Type: application/json

{
  "name": "Manager",
  "description": "Reports to Manager"
}
```

### Update Report To Entry
```
PUT /lookup-tables/report-to/:id
Content-Type: application/json

{
  "name": "Updated Manager",
  "description": "Updated description"
}
```

### Delete Report To Entry
```
DELETE /lookup-tables/report-to/:id
```

## Designation Management

### Get All Designations
```
GET /lookup-tables/designations
```

### Get Designation by ID
```
GET /lookup-tables/designations/:id
```

### Create Designation
```
POST /lookup-tables/designations
Content-Type: application/json

{
  "name": "Senior Agent",
  "description": "Senior Call Center Agent"
}
```

### Update Designation
```
PUT /lookup-tables/designations/:id
Content-Type: application/json

{
  "name": "Updated Senior Agent",
  "description": "Updated description"
}
```

### Delete Designation
```
DELETE /lookup-tables/designations/:id
```

## Unit Section Management

### Get All Unit Sections
```
GET /lookup-tables/unit-sections
```

### Get Unit Section by ID
```
GET /lookup-tables/unit-sections/:id
```

### Create Unit Section
```
POST /lookup-tables/unit-sections
Content-Type: application/json

{
  "name": "Technical Support Unit",
  "description": "Unit responsible for technical support"
}
```

### Update Unit Section
```
PUT /lookup-tables/unit-sections/:id
Content-Type: application/json

{
  "name": "Updated Technical Support Unit",
  "description": "Updated description"
}
```

### Delete Unit Section
```
DELETE /lookup-tables/unit-sections/:id
```

## Role Management

### Get All Roles
```
GET /lookup-tables/roles
```

### Get Role by ID
```
GET /lookup-tables/roles/:id
```

### Create Role
```
POST /lookup-tables/roles
Content-Type: application/json

{
  "name": "Team Lead",
  "description": "Team Lead with supervisory responsibilities"
}
```

### Update Role
```
PUT /lookup-tables/roles/:id
Content-Type: application/json

{
  "name": "Updated Team Lead",
  "description": "Updated description"
}
```

### Delete Role
```
DELETE /lookup-tables/roles/:id
```

## User Role Management

### Get User Roles
```
GET /lookup-tables/users/:userId/roles
```

### Get All Users with Roles
```
GET /lookup-tables/users-with-roles
```

### Assign Multiple Roles to User
```
POST /lookup-tables/users/:userId/roles
Content-Type: application/json

{
  "roleIds": [1, 2, 3]
}
```

### Add Single Role to User
```
POST /lookup-tables/users/:userId/roles/add
Content-Type: application/json

{
  "roleId": 1
}
```

### Remove Role from User
```
DELETE /lookup-tables/users/:userId/roles/:roleId
```

## Updated User Creation

The user creation endpoint has been updated to support the new lookup table structure:

```
POST /users/create-user
Content-Type: application/json

{
  "full_name": "John Doe",
  "email": "john.doe@example.com",
  "password": "password123",
  "report_to_id": 1,
  "designation_id": 2,
  "unit_section_id": 3,
  "roleIds": [1, 2], // Multiple roles
  "extension": 1001,
  "isActive": true
}
```

## Response Format

All endpoints return responses in the following format:

### Success Response
```json
{
  "success": true,
  "data": [...],
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## Validation Rules

- **name**: Required, 1-255 characters
- **description**: Optional, max 1000 characters
- **roleIds**: Array of positive integers
- **roleId**: Positive integer

## Permissions

- **Read operations**: All authenticated users
- **Write operations**: Admin and Super Admin only

## Database Schema

### ReportTo Table
- `id` (INTEGER, PRIMARY KEY, AUTO_INCREMENT)
- `name` (VARCHAR(255), UNIQUE, NOT NULL)
- `description` (TEXT, NULLABLE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Designation Table
- `id` (INTEGER, PRIMARY KEY, AUTO_INCREMENT)
- `name` (VARCHAR(255), UNIQUE, NOT NULL)
- `description` (TEXT, NULLABLE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### UnitSection Table
- `id` (INTEGER, PRIMARY KEY, AUTO_INCREMENT)
- `name` (VARCHAR(255), UNIQUE, NOT NULL)
- `description` (TEXT, NULLABLE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Role Table
- `id` (INTEGER, PRIMARY KEY, AUTO_INCREMENT)
- `name` (VARCHAR(255), UNIQUE, NOT NULL)
- `description` (TEXT, NULLABLE)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### UserRoles Table (Junction Table)
- `id` (INTEGER, PRIMARY KEY, AUTO_INCREMENT)
- `userId` (UUID, FOREIGN KEY)
- `roleId` (INTEGER, FOREIGN KEY)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Updated Users Table
- `report_to_id` (INTEGER, FOREIGN KEY, NULLABLE)
- `designation_id` (INTEGER, FOREIGN KEY, NULLABLE)
- `unit_section_id` (INTEGER, FOREIGN KEY, NULLABLE)
- (Other existing fields remain unchanged)
