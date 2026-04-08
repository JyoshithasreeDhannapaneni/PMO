-- PMO Tracker Database Schema
-- PostgreSQL

-- Create ENUM types
CREATE TYPE plan_type AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
CREATE TYPE project_phase AS ENUM ('KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED');
CREATE TYPE project_status AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE delay_status AS ENUM ('NOT_DELAYED', 'AT_RISK', 'DELAYED');
CREATE TYPE phase_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
CREATE TYPE case_study_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED');
CREATE TYPE notification_type AS ENUM ('DELAY_DETECTED', 'PROJECT_COMPLETED', 'CASE_STUDY_REMINDER', 'PHASE_COMPLETED', 'GENERAL');
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    project_manager VARCHAR(255) NOT NULL,
    account_manager VARCHAR(255) NOT NULL,
    plan_type plan_type DEFAULT 'SILVER',
    
    -- Dates
    planned_start TIMESTAMP NOT NULL,
    planned_end TIMESTAMP NOT NULL,
    actual_start TIMESTAMP,
    actual_end TIMESTAMP,
    
    -- Delay tracking
    delay_days INTEGER DEFAULT 0,
    delay_status delay_status DEFAULT 'NOT_DELAYED',
    
    -- Project lifecycle
    phase project_phase DEFAULT 'KICKOFF',
    status project_status DEFAULT 'ACTIVE',
    
    -- Migration details
    source_platform VARCHAR(255),
    target_platform VARCHAR(255),
    
    -- Cost tracking
    estimated_cost DECIMAL(12, 2),
    actual_cost DECIMAL(12, 2),
    
    -- Notes
    description TEXT,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project phases table
CREATE TABLE project_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_name project_phase NOT NULL,
    planned_date TIMESTAMP NOT NULL,
    actual_date TIMESTAMP,
    status phase_status DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Case studies table
CREATE TABLE case_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status case_study_status DEFAULT 'PENDING',
    title VARCHAR(255),
    content TEXT,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    recipients TEXT[] NOT NULL,
    status notification_status DEFAULT 'PENDING',
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_phase ON projects(phase);
CREATE INDEX idx_projects_delay_status ON projects(delay_status);
CREATE INDEX idx_projects_planned_end ON projects(planned_end);
CREATE INDEX idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX idx_notifications_project_id ON notifications(project_id);
CREATE INDEX idx_notifications_type ON notifications(type);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_phases_updated_at
    BEFORE UPDATE ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_case_studies_updated_at
    BEFORE UPDATE ON case_studies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
