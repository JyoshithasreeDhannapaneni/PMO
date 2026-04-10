-- PostgreSQL Schema for Project Migration Tracking System

-- Create enum types
CREATE TYPE plan_type AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
CREATE TYPE project_phase AS ENUM ('KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED');
CREATE TYPE project_status AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE delay_status AS ENUM ('NOT_DELAYED', 'AT_RISK', 'DELAYED');
CREATE TYPE phase_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
CREATE TYPE case_study_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED');
CREATE TYPE notification_type AS ENUM ('DELAY_DETECTED', 'PROJECT_COMPLETED', 'CASE_STUDY_REMINDER', 'PHASE_COMPLETED', 'GENERAL');
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');
CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED');
CREATE TYPE risk_category AS ENUM ('TECHNICAL', 'SCHEDULE', 'RESOURCE', 'BUDGET', 'SCOPE', 'EXTERNAL', 'ORGANIZATIONAL');
CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE risk_status AS ENUM ('OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED', 'CLOSED');
CREATE TYPE team_role AS ENUM ('PROJECT_MANAGER', 'TECHNICAL_LEAD', 'DEVELOPER', 'QA_ENGINEER', 'BUSINESS_ANALYST', 'ARCHITECT', 'TEAM_MEMBER', 'STAKEHOLDER');
CREATE TYPE document_category AS ENUM ('SOW', 'CONTRACT', 'REQUIREMENTS', 'DESIGN', 'TECHNICAL', 'MEETING_NOTES', 'STATUS_REPORT', 'SIGN_OFF', 'OTHER');
CREATE TYPE report_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'MILESTONE', 'ADHOC');
CREATE TYPE health_status AS ENUM ('GREEN', 'YELLOW', 'RED');
CREATE TYPE change_type AS ENUM ('SCOPE', 'SCHEDULE', 'BUDGET', 'RESOURCE', 'TECHNICAL');
CREATE TYPE change_request_status AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CANCELLED');
CREATE TYPE priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'STATUS_CHANGE', 'EXPORT');
CREATE TYPE activity_type AS ENUM ('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_COMPLETED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_ASSIGNED', 'COMMENT_ADDED', 'DOCUMENT_UPLOADED', 'RISK_IDENTIFIED', 'RISK_RESOLVED', 'TEAM_MEMBER_ADDED', 'STATUS_REPORT_GENERATED', 'CHANGE_REQUEST_SUBMITTED', 'CHANGE_REQUEST_APPROVED', 'MILESTONE_REACHED');
CREATE TYPE dependency_type AS ENUM ('FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH');

-- Migration Templates
CREATE TABLE migration_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Template Phases
CREATE TABLE template_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES migration_templates(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER NOT NULL,
  default_duration INTEGER DEFAULT 7,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_template_phases_template_id ON template_phases(template_id);

-- Template Tasks
CREATE TABLE template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES template_phases(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER NOT NULL,
  default_duration INTEGER DEFAULT 1,
  description TEXT,
  is_milestone BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_template_tasks_phase_id ON template_tasks(phase_id);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  project_manager VARCHAR(255) NOT NULL,
  account_manager VARCHAR(255) NOT NULL,
  plan_type plan_type DEFAULT 'SILVER',
  planned_start TIMESTAMP NOT NULL,
  planned_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  delay_days INTEGER DEFAULT 0,
  delay_status delay_status DEFAULT 'NOT_DELAYED',
  phase project_phase DEFAULT 'KICKOFF',
  status project_status DEFAULT 'ACTIVE',
  migration_types VARCHAR(255),
  source_platform VARCHAR(255),
  target_platform VARCHAR(255),
  estimated_cost DECIMAL(12, 2),
  actual_cost DECIMAL(12, 2),
  description TEXT,
  notes TEXT,
  template_id UUID REFERENCES migration_templates(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_projects_template_id ON projects(template_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_phase ON projects(phase);
CREATE INDEX idx_projects_delay_status ON projects(delay_status);

-- Project Phase Records
CREATE TABLE project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_name VARCHAR(255) NOT NULL,
  order_index INTEGER DEFAULT 0,
  planned_start TIMESTAMP NOT NULL,
  planned_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  status phase_status DEFAULT 'PENDING',
  progress INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_phases_project_id ON project_phases(project_id);

-- Project Tasks
CREATE TABLE project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_record_id UUID NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER NOT NULL,
  status task_status DEFAULT 'TODO',
  planned_start TIMESTAMP NOT NULL,
  planned_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  duration INTEGER DEFAULT 1,
  progress INTEGER DEFAULT 0,
  assignee VARCHAR(255),
  is_milestone BOOLEAN DEFAULT false,
  notes TEXT,
  priority priority DEFAULT 'MEDIUM',
  estimated_hours DECIMAL(6, 2),
  actual_hours DECIMAL(6, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_phase_record_id ON project_tasks(phase_record_id);

-- Task Dependencies
CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  dependency_type dependency_type DEFAULT 'FINISH_TO_START',
  lag_days INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, depends_on_task_id)
);
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

-- Project Risks
CREATE TABLE project_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category risk_category DEFAULT 'TECHNICAL',
  probability risk_level DEFAULT 'MEDIUM',
  impact risk_level DEFAULT 'MEDIUM',
  status risk_status DEFAULT 'OPEN',
  mitigation TEXT,
  contingency TEXT,
  owner VARCHAR(255),
  due_date TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_risks_project_id ON project_risks(project_id);

-- Project Team Members
CREATE TABLE project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role team_role DEFAULT 'TEAM_MEMBER',
  department VARCHAR(255),
  allocation INTEGER DEFAULT 100,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_team_members_project_id ON project_team_members(project_id);

-- Project Documents
CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category document_category DEFAULT 'OTHER',
  file_url VARCHAR(500),
  file_size INTEGER,
  mime_type VARCHAR(100),
  version VARCHAR(50),
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_documents_project_id ON project_documents(project_id);

-- Project Status Reports
CREATE TABLE project_status_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date TIMESTAMP NOT NULL,
  report_type report_type DEFAULT 'WEEKLY',
  overall_status health_status DEFAULT 'GREEN',
  schedule_status health_status DEFAULT 'GREEN',
  budget_status health_status DEFAULT 'GREEN',
  resource_status health_status DEFAULT 'GREEN',
  completion_percentage INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  accomplishments TEXT,
  planned_activities TEXT,
  issues TEXT,
  risks TEXT,
  decisions TEXT,
  budget_planned DECIMAL(12, 2),
  budget_actual DECIMAL(12, 2),
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_status_reports_project_id ON project_status_reports(project_id);

-- Change Requests
CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  change_type change_type DEFAULT 'SCOPE',
  priority priority DEFAULT 'MEDIUM',
  status change_request_status DEFAULT 'PENDING',
  impact TEXT,
  justification TEXT,
  requested_by VARCHAR(255) NOT NULL,
  requested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(255),
  reviewed_date TIMESTAMP,
  approved_by VARCHAR(255),
  approved_date TIMESTAMP,
  cost_impact DECIMAL(12, 2),
  schedule_impact INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_change_requests_project_id ON change_requests(project_id);

-- Case Studies
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

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipients TEXT NOT NULL,
  status notification_status DEFAULT 'PENDING',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_project_id ON notifications(project_id);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role user_role DEFAULT 'VIEWER',
  avatar VARCHAR(500),
  department VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  preferences TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Password Resets
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action audit_action NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_name VARCHAR(255),
  old_values TEXT,
  new_values TEXT,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);

-- Activities
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type activity_type NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_name VARCHAR(255),
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_activities_user_id ON activities(user_id);
CREATE INDEX idx_activities_entity ON activities(entity_type, entity_id);
CREATE INDEX idx_activities_created_at ON activities(created_at);

-- File Uploads
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  path VARCHAR(500) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  uploaded_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_file_uploads_entity ON file_uploads(entity_type, entity_id);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_phases_updated_at BEFORE UPDATE ON project_phases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_tasks_updated_at BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_risks_updated_at BEFORE UPDATE ON project_risks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_team_members_updated_at BEFORE UPDATE ON project_team_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON project_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_status_reports_updated_at BEFORE UPDATE ON project_status_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_change_requests_updated_at BEFORE UPDATE ON change_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_case_studies_updated_at BEFORE UPDATE ON case_studies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_migration_templates_updated_at BEFORE UPDATE ON migration_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_template_phases_updated_at BEFORE UPDATE ON template_phases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_template_tasks_updated_at BEFORE UPDATE ON template_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
