# RLS Policy Recommendations for Admin-Technician Operations

## Overview
This document outlines the recommended Row Level Security (RLS) policies to support admin-technician order creation on behalf of customers while maintaining data isolation and security.

## Current Security Implementation
- **Middleware-based permissions**: Server-side permission checking in API routes
- **Client-side guards**: React components with permission validation
- **Authentication**: Supabase Auth with role-based access control

## Recommended RLS Policies

### 1. Orders Table Policies

#### Allow Admin-Technicians to Create Orders for Any Customer
```sql
-- Policy: admin_technician_create_orders
-- Allows admin-technicians to create orders for any customer
CREATE POLICY "admin_technician_create_orders" ON "public"."orders"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if user is creating their own order (self-service)
  auth.uid() = user_id
  OR
  -- Allow if user is admin-technician creating for customer
  (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = auth.uid()
        AND c.is_admin = true
        AND EXISTS (
          SELECT 1 FROM technicians t 
          WHERE t.id = auth.uid()
        )
    )
  )
);
```

#### Allow Users to View Their Own Orders + Admin-Technicians to View All
```sql
-- Policy: view_orders_policy
-- Customers see their own orders, admin-technicians see all
CREATE POLICY "view_orders_policy" ON "public"."orders"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  -- Allow if user owns the order
  auth.uid() = user_id
  OR
  -- Allow if user is admin-technician
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = auth.uid()
      AND c.is_admin = true
      AND EXISTS (
        SELECT 1 FROM technicians t 
        WHERE t.id = auth.uid()
      )
  )
);
```

### 2. Customers Table Policies

#### Allow Admin-Technicians to View All Customer Records
```sql
-- Policy: admin_technician_view_customers
-- Allows admin-technicians to search and view customer records
CREATE POLICY "admin_technician_view_customers" ON "public"."customers"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  -- Allow users to view their own record
  auth.uid() = id
  OR
  -- Allow admin-technicians to view all customer records
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = auth.uid()
      AND c.is_admin = true
      AND EXISTS (
        SELECT 1 FROM technicians t 
        WHERE t.id = auth.uid()
      )
  )
);
```

#### Allow Admin-Technicians to Create Customer Records
```sql
-- Policy: admin_technician_create_customers
-- Allows admin-technicians to create new customer accounts
CREATE POLICY "admin_technician_create_customers" ON "public"."customers"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = auth.uid()
      AND c.is_admin = true
      AND EXISTS (
        SELECT 1 FROM technicians t 
        WHERE t.id = auth.uid()
      )
  )
);
```

### 3. Jobs Table Policies

#### Allow Admin-Technicians to Manage All Jobs
```sql
-- Policy: admin_technician_manage_jobs
-- Allows admin-technicians to view and manage all jobs
CREATE POLICY "admin_technician_manage_jobs" ON "public"."jobs"
AS PERMISSIVE FOR ALL
TO authenticated
USING (
  -- Allow customers to view jobs for their orders
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_id 
      AND o.user_id = auth.uid()
  )
  OR
  -- Allow admin-technicians to manage all jobs
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = auth.uid()
      AND c.is_admin = true
      AND EXISTS (
        SELECT 1 FROM technicians t 
        WHERE t.id = auth.uid()
      )
  )
);
```

### 4. Addresses Table Policies

#### Allow Access for Order-Related Addresses
```sql
-- Policy: address_access_policy
-- Controls access to address records
CREATE POLICY "address_access_policy" ON "public"."addresses"
AS PERMISSIVE FOR ALL
TO authenticated
USING (
  -- Allow customers to access addresses they use in orders
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.address_id = id 
      AND o.user_id = auth.uid()
  )
  OR
  -- Allow customers to access their home address
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.home_address_id = id
      AND c.id = auth.uid()
  )
  OR
  -- Allow admin-technicians to access all addresses
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = auth.uid()
      AND c.is_admin = true
      AND EXISTS (
        SELECT 1 FROM technicians t 
        WHERE t.id = auth.uid()
      )
  )
);
```

## Security Considerations

### 1. Defense in Depth
- RLS policies provide database-level security
- Middleware provides application-level security
- Client guards provide UI-level security

### 2. Audit Trail
- All staff-created orders include `created_by_staff` and `staff_user_id` fields
- Security events are logged for audit purposes
- Failed permission attempts are tracked

### 3. Data Isolation
- Customers can only see their own data by default
- Admin-technicians have controlled access to customer data
- Regular technicians (without admin) have limited access

## Implementation Notes

### 1. Schema Requirements
The following columns should be added to support staff tracking:
```sql
-- Add to orders table
ALTER TABLE orders ADD COLUMN created_by_staff BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN staff_user_id UUID REFERENCES customers(id);

-- Add index for performance
CREATE INDEX idx_orders_staff_created ON orders(created_by_staff, staff_user_id);
```

### 2. Testing Policies
Each policy should be tested with:
- Customer users (self-service)
- Admin-only users (no technician role)
- Technician-only users (no admin role)
- Admin-technician users (both roles)
- Unauthenticated requests

### 3. Policy Activation
```sql
-- Enable RLS on all relevant tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
```

## Migration Strategy

1. **Phase 1**: Implement and test policies in staging environment
2. **Phase 2**: Deploy schema changes (staff tracking columns)
3. **Phase 3**: Deploy application changes with middleware security
4. **Phase 4**: Enable RLS policies in production
5. **Phase 5**: Monitor and adjust policies based on usage patterns

## Monitoring and Maintenance

- Monitor policy performance impact
- Review access logs for unusual patterns
- Regularly audit policy effectiveness
- Update policies as business requirements change