-- Migration: Add Microsoft OAuth columns to users table
-- Run this SQL in your MySQL database to enable Microsoft authentication

-- Add microsoft_id column for storing Azure AD user ID
ALTER TABLE users ADD COLUMN microsoft_id VARCHAR(255) NULL AFTER password;

-- Add auth_provider column to track how user authenticated
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'local' AFTER microsoft_id;

-- Create index for faster Microsoft ID lookups
CREATE INDEX idx_users_microsoft_id ON users(microsoft_id);

-- Allow empty password for Microsoft-authenticated users
ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL;
