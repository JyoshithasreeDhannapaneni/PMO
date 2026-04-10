import { pool } from '../config/database';
import { logger } from '../utils/logger';
import 'dotenv/config';

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'MANAGER', 'VIEWER') DEFAULT 'VIEWER',
  avatar VARCHAR(500),
  department VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_login_at DATETIME,
  preferences TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password resets table
CREATE TABLE IF NOT EXISTS password_resets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_resets_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migration templates table
CREATE TABLE IF NOT EXISTS migration_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Template phases table
CREATE TABLE IF NOT EXISTS template_phases (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  template_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  order_index INT NOT NULL,
  default_duration INT DEFAULT 7,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_template_phases_template_id (template_id),
  FOREIGN KEY (template_id) REFERENCES migration_templates(id) ON DELETE CASCADE
);

-- Template tasks table
CREATE TABLE IF NOT EXISTS template_tasks (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  phase_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  order_index INT NOT NULL,
  default_duration INT DEFAULT 1,
  description TEXT,
  is_milestone BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_template_tasks_phase_id (phase_id),
  FOREIGN KEY (phase_id) REFERENCES template_phases(id) ON DELETE CASCADE
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  project_manager VARCHAR(255) NOT NULL,
  account_manager VARCHAR(255) NOT NULL,
  plan_type ENUM('BRONZE', 'SILVER', 'GOLD', 'PLATINUM') DEFAULT 'SILVER',
  planned_start DATETIME NOT NULL,
  planned_end DATETIME NOT NULL,
  actual_start DATETIME,
  actual_end DATETIME,
  delay_days INT DEFAULT 0,
  delay_status ENUM('NOT_DELAYED', 'AT_RISK', 'DELAYED') DEFAULT 'NOT_DELAYED',
  phase ENUM('KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED') DEFAULT 'KICKOFF',
  status ENUM('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED') DEFAULT 'ACTIVE',
  migration_types VARCHAR(255),
  source_platform VARCHAR(255),
  target_platform VARCHAR(255),
  estimated_cost DECIMAL(12, 2),
  actual_cost DECIMAL(12, 2),
  description TEXT,
  notes TEXT,
  template_id CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_template_id (template_id),
  FOREIGN KEY (template_id) REFERENCES migration_templates(id)
);

-- Project phases table
CREATE TABLE IF NOT EXISTS project_phases (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  phase_name VARCHAR(255) NOT NULL,
  order_index INT DEFAULT 0,
  planned_start DATETIME NOT NULL,
  planned_end DATETIME NOT NULL,
  actual_start DATETIME,
  actual_end DATETIME,
  status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED') DEFAULT 'PENDING',
  progress INT DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_phases_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Project tasks table
CREATE TABLE IF NOT EXISTS project_tasks (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  phase_record_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  order_index INT NOT NULL,
  status ENUM('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED') DEFAULT 'TODO',
  planned_start DATETIME NOT NULL,
  planned_end DATETIME NOT NULL,
  actual_start DATETIME,
  actual_end DATETIME,
  duration INT DEFAULT 1,
  progress INT DEFAULT 0,
  assignee VARCHAR(255),
  is_milestone BOOLEAN DEFAULT false,
  notes TEXT,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  estimated_hours DECIMAL(6, 2),
  actual_hours DECIMAL(6, 2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_tasks_project_id (project_id),
  INDEX idx_project_tasks_phase_record_id (phase_record_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_record_id) REFERENCES project_phases(id) ON DELETE CASCADE
);

-- Task dependencies table
CREATE TABLE IF NOT EXISTS task_dependencies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  task_id CHAR(36) NOT NULL,
  depends_on_task_id CHAR(36) NOT NULL,
  dependency_type ENUM('FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH') DEFAULT 'FINISH_TO_START',
  lag_days INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_dependency (task_id, depends_on_task_id),
  INDEX idx_task_dependencies_task_id (task_id),
  INDEX idx_task_dependencies_depends_on (depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
);

-- Project risks table
CREATE TABLE IF NOT EXISTS project_risks (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM('TECHNICAL', 'SCHEDULE', 'RESOURCE', 'BUDGET', 'SCOPE', 'EXTERNAL', 'ORGANIZATIONAL') DEFAULT 'TECHNICAL',
  probability ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  impact ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  status ENUM('OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED', 'CLOSED') DEFAULT 'OPEN',
  mitigation TEXT,
  contingency TEXT,
  owner VARCHAR(255),
  due_date DATETIME,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_risks_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Project team members table
CREATE TABLE IF NOT EXISTS project_team_members (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('PROJECT_MANAGER', 'TECHNICAL_LEAD', 'DEVELOPER', 'QA_ENGINEER', 'BUSINESS_ANALYST', 'ARCHITECT', 'TEAM_MEMBER', 'STAKEHOLDER') DEFAULT 'TEAM_MEMBER',
  department VARCHAR(255),
  allocation INT DEFAULT 100,
  start_date DATETIME,
  end_date DATETIME,
  is_active BOOLEAN DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_team_members_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Project documents table
CREATE TABLE IF NOT EXISTS project_documents (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM('SOW', 'CONTRACT', 'REQUIREMENTS', 'DESIGN', 'TECHNICAL', 'MEETING_NOTES', 'STATUS_REPORT', 'SIGN_OFF', 'OTHER') DEFAULT 'OTHER',
  file_url VARCHAR(500),
  file_size INT,
  mime_type VARCHAR(100),
  version VARCHAR(50),
  uploaded_by VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_documents_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Project status reports table
CREATE TABLE IF NOT EXISTS project_status_reports (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  report_date DATETIME NOT NULL,
  report_type ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'MILESTONE', 'ADHOC') DEFAULT 'WEEKLY',
  overall_status ENUM('GREEN', 'YELLOW', 'RED') DEFAULT 'GREEN',
  schedule_status ENUM('GREEN', 'YELLOW', 'RED') DEFAULT 'GREEN',
  budget_status ENUM('GREEN', 'YELLOW', 'RED') DEFAULT 'GREEN',
  resource_status ENUM('GREEN', 'YELLOW', 'RED') DEFAULT 'GREEN',
  completion_percentage INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  tasks_total INT DEFAULT 0,
  accomplishments TEXT,
  planned_activities TEXT,
  issues TEXT,
  risks TEXT,
  decisions TEXT,
  budget_planned DECIMAL(12, 2),
  budget_actual DECIMAL(12, 2),
  created_by VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_status_reports_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Change requests table
CREATE TABLE IF NOT EXISTS change_requests (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  change_type ENUM('SCOPE', 'SCHEDULE', 'BUDGET', 'RESOURCE', 'TECHNICAL') DEFAULT 'SCOPE',
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  status ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CANCELLED') DEFAULT 'PENDING',
  impact TEXT,
  justification TEXT,
  requested_by VARCHAR(255) NOT NULL,
  requested_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(255),
  reviewed_date DATETIME,
  approved_by VARCHAR(255),
  approved_date DATETIME,
  cost_impact DECIMAL(12, 2),
  schedule_impact INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_change_requests_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Case studies table
CREATE TABLE IF NOT EXISTS case_studies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36) UNIQUE NOT NULL,
  status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED') DEFAULT 'PENDING',
  title VARCHAR(255),
  content TEXT,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36),
  type ENUM('DELAY_DETECTED', 'PROJECT_COMPLETED', 'CASE_STUDY_REMINDER', 'PHASE_COMPLETED', 'GENERAL') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipients TEXT NOT NULL,
  status ENUM('PENDING', 'SENT', 'FAILED') DEFAULT 'PENDING',
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_project_id (project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36),
  action ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'STATUS_CHANGE', 'EXPORT') NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_name VARCHAR(255),
  old_values TEXT,
  new_values TEXT,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_user_id (user_id),
  INDEX idx_audit_logs_entity (entity_type, entity_id),
  INDEX idx_audit_logs_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  parent_id CHAR(36),
  is_edited BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comments_user_id (user_id),
  INDEX idx_comments_entity (entity_type, entity_id),
  INDEX idx_comments_parent_id (parent_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36),
  type ENUM('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_COMPLETED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_ASSIGNED', 'COMMENT_ADDED', 'DOCUMENT_UPLOADED', 'RISK_IDENTIFIED', 'RISK_RESOLVED', 'TEAM_MEMBER_ADDED', 'STATUS_REPORT_GENERATED', 'CHANGE_REQUEST_SUBMITTED', 'CHANGE_REQUEST_APPROVED', 'MILESTONE_REACHED') NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_name VARCHAR(255),
  description TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activities_user_id (user_id),
  INDEX idx_activities_entity (entity_type, entity_id),
  INDEX idx_activities_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- File uploads table
CREATE TABLE IF NOT EXISTS file_uploads (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  path VARCHAR(500) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  uploaded_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file_uploads_entity (entity_type, entity_id)
);
`;

async function initDatabase() {
  logger.info('🔄 Initializing MySQL database...');
  
  try {
    const statements = schema.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }
    
    logger.info('✅ Database schema created successfully');
  } catch (error) {
    logger.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

initDatabase().catch(console.error);
