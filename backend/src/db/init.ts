import { Pool } from 'pg';
import { logger } from '../utils/logger';
import 'dotenv/config';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'pmo_tracker';
const DB_PORT = Number(process.env.DB_PORT) || 5432;

async function ensureDatabaseExists() {
  // Connect to the default 'postgres' database to create pmo_tracker if needed
  const adminPool = new Pool({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: 'postgres', port: DB_PORT });
  const client = await adminPool.connect();
  try {
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${DB_NAME}"`);
      logger.info(`✅ Database "${DB_NAME}" created`);
    } else {
      logger.info(`ℹ️  Database "${DB_NAME}" already exists`);
    }
  } finally {
    client.release();
    await adminPool.end();
  }
}

const pool = new Pool({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, port: DB_PORT });

export const schema = `
-- Enum types (CREATE TYPE ... IF NOT EXISTS requires PG 9.x trick)
DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE project_phase AS ENUM ('KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE delay_status AS ENUM ('NOT_DELAYED', 'AT_RISK', 'DELAYED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE phase_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE case_study_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('DELAY_DETECTED', 'PROJECT_COMPLETED', 'CASE_STUDY_REMINDER', 'PHASE_COMPLETED', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE risk_category AS ENUM ('TECHNICAL', 'SCHEDULE', 'RESOURCE', 'BUDGET', 'SCOPE', 'EXTERNAL', 'ORGANIZATIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE risk_status AS ENUM ('OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('PROJECT_MANAGER', 'TECHNICAL_LEAD', 'DEVELOPER', 'QA_ENGINEER', 'BUSINESS_ANALYST', 'ARCHITECT', 'TEAM_MEMBER', 'STAKEHOLDER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE document_category AS ENUM ('SOW', 'CONTRACT', 'REQUIREMENTS', 'DESIGN', 'TECHNICAL', 'MEETING_NOTES', 'STATUS_REPORT', 'SIGN_OFF', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE report_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'MILESTONE', 'ADHOC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE health_status AS ENUM ('GREEN', 'YELLOW', 'RED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE change_type AS ENUM ('SCOPE', 'SCHEDULE', 'BUDGET', 'RESOURCE', 'TECHNICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE change_request_status AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'STATUS_CHANGE', 'EXPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_COMPLETED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_ASSIGNED', 'COMMENT_ADDED', 'DOCUMENT_UPLOADED', 'RISK_IDENTIFIED', 'RISK_RESOLVED', 'TEAM_MEMBER_ADDED', 'STATUS_REPORT_GENERATED', 'CHANGE_REQUEST_SUBMITTED', 'CHANGE_REQUEST_APPROVED', 'MILESTONE_REACHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE dependency_type AS ENUM ('FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS migration_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS template_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES migration_templates(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER NOT NULL,
  default_duration INTEGER DEFAULT 7,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_template_phases_template_id ON template_phases(template_id);

CREATE TABLE IF NOT EXISTS template_tasks (
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
CREATE INDEX IF NOT EXISTS idx_template_tasks_phase_id ON template_tasks(phase_id);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  project_manager VARCHAR(255) NOT NULL,
  account_manager VARCHAR(255) NOT NULL,
  plan_type VARCHAR(50) DEFAULT 'SILVER',
  planned_start TIMESTAMP NOT NULL,
  planned_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  delay_days INTEGER DEFAULT 0,
  delay_status VARCHAR(20) DEFAULT 'NOT_DELAYED',
  phase VARCHAR(50) DEFAULT 'KICKOFF',
  status VARCHAR(20) DEFAULT 'ACTIVE',
  migration_types VARCHAR(500),
  source_platform VARCHAR(500),
  target_platform VARCHAR(500),
  estimated_cost DECIMAL(12, 2),
  actual_cost DECIMAL(12, 2),
  description TEXT,
  notes TEXT,
  template_id UUID REFERENCES migration_templates(id),
  number_of_servers INTEGER,
  project_memory VARCHAR(100),
  client_name VARCHAR(255),
  is_escalated BOOLEAN NOT NULL DEFAULT false,
  escalation_priority VARCHAR(20) DEFAULT NULL,
  escalated_at TIMESTAMP DEFAULT NULL,
  escalation_notes TEXT DEFAULT NULL,
  is_overaged BOOLEAN NOT NULL DEFAULT false,
  overage_amount DECIMAL(15,2) DEFAULT NULL,
  overage_notes TEXT DEFAULT NULL,
  resolved_date TIMESTAMP DEFAULT NULL,
  escalation_archived BOOLEAN NOT NULL DEFAULT false,
  extended_start_date TIMESTAMP DEFAULT NULL,
  extended_end_date TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 2026-08-26: template_id was only ever declared inside CREATE TABLE IF NOT EXISTS above,
-- which is a no-op on any database where projects already existed before this column was
-- added (confirmed live on production) -- the index below then fails on "column does not
-- exist", aborting every statement after it in this same batch (the whole schema string is
-- run as one client.query() in index.ts, so one failure here silently skips everything
-- after it, including phase_completion_pct and beyond). Explicit ALTER TABLE backfills it
-- on pre-existing databases; a no-op wherever CREATE TABLE already added it.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES migration_templates(id);
CREATE INDEX IF NOT EXISTS idx_projects_template_id ON projects(template_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_phase ON projects(phase);
CREATE INDEX IF NOT EXISTS idx_projects_delay_status ON projects(delay_status);

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_name VARCHAR(255) NOT NULL,
  order_index INTEGER DEFAULT 0,
  planned_start TIMESTAMP NOT NULL,
  planned_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  status VARCHAR(20) DEFAULT 'PENDING',
  progress INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_record_id UUID NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'TODO',
  planned_start TIMESTAMP NOT NULL,
  planned_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  duration INTEGER DEFAULT 1,
  progress INTEGER DEFAULT 0,
  assignee VARCHAR(255),
  is_milestone BOOLEAN DEFAULT false,
  notes TEXT,
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  estimated_hours DECIMAL(6, 2),
  actual_hours DECIMAL(6, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_phase_record_id ON project_tasks(phase_record_id);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(30) DEFAULT 'FINISH_TO_START',
  lag_days INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

CREATE TABLE IF NOT EXISTS project_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(30) DEFAULT 'TECHNICAL',
  probability VARCHAR(20) DEFAULT 'MEDIUM',
  impact VARCHAR(20) DEFAULT 'MEDIUM',
  status VARCHAR(20) DEFAULT 'OPEN',
  mitigation TEXT,
  contingency TEXT,
  owner VARCHAR(255),
  due_date TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_risks_project_id ON project_risks(project_id);

CREATE TABLE IF NOT EXISTS project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(30) DEFAULT 'TEAM_MEMBER',
  department VARCHAR(255),
  allocation INTEGER DEFAULT 100,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_team_members_project_id ON project_team_members(project_id);

ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS shift VARCHAR(100);
ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS shift_timezone VARCHAR(20);
ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS working_pattern VARCHAR(50);
ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS migration_types VARCHAR(100);
ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 100;
ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS reporting_to VARCHAR(255);

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(30) DEFAULT 'OTHER',
  file_url VARCHAR(500),
  file_size INTEGER,
  mime_type VARCHAR(100),
  version VARCHAR(50),
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);

CREATE TABLE IF NOT EXISTS project_status_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date TIMESTAMP NOT NULL,
  report_type VARCHAR(20) DEFAULT 'WEEKLY',
  overall_status VARCHAR(10) DEFAULT 'GREEN',
  schedule_status VARCHAR(10) DEFAULT 'GREEN',
  budget_status VARCHAR(10) DEFAULT 'GREEN',
  resource_status VARCHAR(10) DEFAULT 'GREEN',
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
CREATE INDEX IF NOT EXISTS idx_project_status_reports_project_id ON project_status_reports(project_id);

CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  change_type VARCHAR(20) DEFAULT 'SCOPE',
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  status VARCHAR(20) DEFAULT 'PENDING',
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
CREATE INDEX IF NOT EXISTS idx_change_requests_project_id ON change_requests(project_id);

CREATE TABLE IF NOT EXISTS case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'PENDING',
  title VARCHAR(255),
  content TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_study_id UUID NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    issue TEXT,
    root_cause TEXT,
    fix TEXT,
    prevention TEXT,
    category VARCHAR(100) DEFAULT 'General',
    customer_name VARCHAR(255),
    project_manager VARCHAR(255),
    migration_types VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_kb_articles_case_study ON kb_articles(case_study_id);
  CREATE INDEX IF NOT EXISTS idx_kb_articles_project ON kb_articles(project_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipients TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON notifications(project_id);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  role VARCHAR(20) DEFAULT 'VIEWER',
  avatar VARCHAR(500),
  department VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  preferences TEXT,
  microsoft_id VARCHAR(255),
  auth_provider VARCHAR(50) DEFAULT 'local',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_microsoft_id ON users(microsoft_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_name VARCHAR(255),
  old_values TEXT,
  new_values TEXT,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS comments (
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
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_name VARCHAR(255),
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

CREATE TABLE IF NOT EXISTS file_uploads (
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
CREATE INDEX IF NOT EXISTS idx_file_uploads_entity ON file_uploads(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS escalation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  escalation_type VARCHAR(100),
  notes TEXT,
  escalated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_date TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_esc_hist_project ON escalation_history(project_id);

CREATE TABLE IF NOT EXISTS overage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  overage_amount DECIMAL(15,2) NULL,
  notes TEXT NULL,
  extended_start_date TIMESTAMP NULL,
  extended_end_date TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_overage_hist_project ON overage_history(project_id);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  host VARCHAR(255) NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  email VARCHAR(255) NOT NULL DEFAULT '',
  password VARCHAR(255) NOT NULL DEFAULT '',
  security VARCHAR(10) NOT NULL DEFAULT 'TLS',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS zenop_doc_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_zenop_doc_id ON projects(zenop_doc_id) WHERE zenop_doc_id IS NOT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS phase_completion_pct SMALLINT DEFAULT 0;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_project_phases_updated_at BEFORE UPDATE ON project_phases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_project_tasks_updated_at BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_project_risks_updated_at BEFORE UPDATE ON project_risks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_project_team_members_updated_at BEFORE UPDATE ON project_team_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON project_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_project_status_reports_updated_at BEFORE UPDATE ON project_status_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_change_requests_updated_at BEFORE UPDATE ON change_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_case_studies_updated_at BEFORE UPDATE ON case_studies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON kb_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_migration_templates_updated_at BEFORE UPDATE ON migration_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_template_phases_updated_at BEFORE UPDATE ON template_phases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_template_tasks_updated_at BEFORE UPDATE ON template_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

async function initDatabase() {
  await ensureDatabaseExists();
  logger.info(`🔄 Initializing schema in "${DB_NAME}"...`);
  const client = await pool.connect();
  try {
    await client.query(schema);
    logger.info('✅ Database schema created successfully');
  } catch (error) {
    logger.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Only auto-run when this file is the entry point (npm run db:init)
if (require.main === module) {
  initDatabase().catch(console.error);
}
