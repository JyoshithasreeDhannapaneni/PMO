import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { query, execute } from './config/db';

import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import phaseRoutes from './routes/phaseRoutes';
import caseStudyRoutes from './routes/caseStudyRoutes';
import notificationRoutes from './routes/notificationRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import templateRoutes from './routes/templateRoutes';
import taskRoutes from './routes/taskRoutes';
import riskRoutes from './routes/riskRoutes';
import teamRoutes from './routes/teamRoutes';
import statusReportRoutes from './routes/statusReportRoutes';
import changeRequestRoutes from './routes/changeRequestRoutes';
import documentRoutes from './routes/documentRoutes';
import auditRoutes from './routes/auditRoutes';
import activityRoutes from './routes/activityRoutes';
import commentRoutes from './routes/commentRoutes';
import searchRoutes from './routes/searchRoutes';
import exportRoutes from './routes/exportRoutes';
import managerGoalsRoutes from './routes/managerGoalsRoutes';
import smtpRoutes from './routes/smtpRoutes';
<<<<<<< Updated upstream
import pmoSettingsRoutes from './routes/pmoSettingsRoutes';
import archiveRoutes from './routes/archiveRoutes';
import { initializeCronJobs } from './jobs';
import settingsRoutes from './routes/settingsRoutes';
import accountManagerRoutes from './routes/accountManagerRoutes';
import customerSuccessRoutes from './routes/customerSuccessRoutes';
import pocDocumentsRoutes from './routes/pocDocumentsRoutes';
import migrationChecklistRoutes from './routes/migrationChecklistRoutes';
import serverAlertRoutes from './routes/serverAlertRoutes';

=======
import settingsRoutes from './routes/settingsRoutes';

import { initializeCronJobs } from './jobs/index';
>>>>>>> Stashed changes
import { logger } from './utils/logger';
import { authService } from './services/authService';
import { templateService } from './services/templateService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// serve uploaded poc documents
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/phases', phaseRoutes);
app.use('/api/case-studies', caseStudyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/risks', riskRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/reports', statusReportRoutes);
app.use('/api/change-requests', changeRequestRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/manager-goals', managerGoalsRoutes);
app.use('/api/smtp', smtpRoutes);
<<<<<<< Updated upstream
app.use('/api/pmo-settings', pmoSettingsRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/account-manager', accountManagerRoutes);
app.use('/api/customer-success', customerSuccessRoutes);
app.use('/api/poc-documents', pocDocumentsRoutes);
app.use('/api/migration-checklists', migrationChecklistRoutes);
app.use('/api/server-alerts', serverAlertRoutes);
=======
app.use('/api/settings', settingsRoutes);
>>>>>>> Stashed changes

app.use(notFoundHandler);
app.use(errorHandler);
async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT COUNT(*) as cnt FROM information_schema.columns
       WHERE table_catalog = current_database() AND table_schema = 'public'
       AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return Number(result.rows[0]?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

async function runMigrations() {
  const alterStatements = [
    `ALTER TABLE projects ALTER COLUMN phase TYPE VARCHAR(50)`,
    `ALTER TABLE projects ALTER COLUMN plan_type TYPE VARCHAR(50)`,
    `ALTER TABLE projects ALTER COLUMN migration_types TYPE VARCHAR(500)`,
    `ALTER TABLE projects ALTER COLUMN source_platform TYPE VARCHAR(500)`,
    `ALTER TABLE projects ALTER COLUMN target_platform TYPE VARCHAR(500)`,
  ];
  for (const sql of alterStatements) {
    try { await execute(sql); } catch { /* already correct type — ignore */ }
  }

  if (!await columnExists('projects', 'number_of_servers')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN number_of_servers INTEGER`); } catch {}
  }
  if (!await columnExists('projects', 'project_memory')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN project_memory VARCHAR(100)`); } catch {}
  }
  if (!await columnExists('projects', 'is_escalated')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN is_escalated BOOLEAN NOT NULL DEFAULT false`); } catch {}
  }
  if (!await columnExists('projects', 'escalation_priority')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN escalation_priority VARCHAR(20) DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'escalated_at')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN escalated_at TIMESTAMP DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'escalation_notes')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN escalation_notes TEXT DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'is_overaged')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN is_overaged BOOLEAN NOT NULL DEFAULT false`); } catch {}
  }
  if (!await columnExists('projects', 'overage_amount')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN overage_amount DECIMAL(15,2) DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'overage_notes')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN overage_notes TEXT DEFAULT NULL`); } catch {}
  }

  const phaseRangeCols = [
    'cloud_adding_start', 'cloud_adding_end', 'cloud_adding_notes',
    'pilot_migration_start', 'pilot_migration_end', 'pilot_migration_notes',
    'onetime_migration_start', 'onetime_migration_end', 'onetime_migration_notes',
    'delta_migration_start', 'delta_migration_end', 'delta_migration_notes',
    'final_validation_start', 'final_validation_end', 'final_validation_notes',
  ];
  for (const col of phaseRangeCols) {
    if (!await columnExists('projects', col)) {
      const colType = col.endsWith('_notes') ? 'TEXT' : 'TIMESTAMP';
      try { await execute(`ALTER TABLE projects ADD COLUMN ${col} ${colType} DEFAULT NULL`); } catch {}
    }
  }

  // Normalise all existing project names to lowercase
  try { await execute(`UPDATE projects SET name = LOWER(name) WHERE name != LOWER(name)`); } catch {}

  // Normalise account manager names to 3 canonical values
  const amJoy = `('joy','joy prakash','joy prakash a','vivin','vivin joseph')`;
  const amArun = `('arundhati','arundhanti','arundhati sen','arundhathi','arundhathi sen')`;
  const amDeepak = `('deepak','deepak r j','deepak rj','deepak r')`;
  try { await execute(`UPDATE projects SET account_manager = 'Joy Prakash' WHERE LOWER(TRIM(account_manager)) = ANY(ARRAY${amJoy}::text[])`); } catch {}
  try { await execute(`UPDATE projects SET account_manager = 'Arundhati Sen' WHERE LOWER(TRIM(account_manager)) = ANY(ARRAY${amArun}::text[])`); } catch {}
  try { await execute(`UPDATE projects SET account_manager = 'Deepak R J' WHERE LOWER(TRIM(account_manager)) = ANY(ARRAY${amDeepak}::text[])`); } catch {}
  try { await execute(`UPDATE users SET name = 'Joy Prakash' WHERE LOWER(TRIM(name)) = ANY(ARRAY${amJoy}::text[])`); } catch {}
  try { await execute(`UPDATE users SET name = 'Arundhati Sen' WHERE LOWER(TRIM(name)) = ANY(ARRAY${amArun}::text[])`); } catch {}
  try { await execute(`UPDATE users SET name = 'Deepak R J' WHERE LOWER(TRIM(name)) = ANY(ARRAY${amDeepak}::text[])`); } catch {}

  // Rename MANAGER role to PROJECT_MANAGER
  try { await execute(`UPDATE users SET role = 'PROJECT_MANAGER' WHERE role = 'MANAGER'`); } catch {}

  // Updated roles constraint including PROJECT_MANAGER
  try {
    await execute(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await execute(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','PROJECT_MANAGER','VIEWER','PRE_SALES','ACCOUNT_MANAGER'))`);
  } catch {}

  // POC project support
  if (!await columnExists('projects', 'project_type')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN project_type VARCHAR(20) NOT NULL DEFAULT 'MIGRATION'`); } catch {}
  }
  const pocCols: [string, string][] = [
    ['poc_qualification_status', `VARCHAR(20) NOT NULL DEFAULT 'not_started'`],
    ['poc_env_setup_status',     `VARCHAR(20) NOT NULL DEFAULT 'not_started'`],
    ['poc_trial_status',         `VARCHAR(20) NOT NULL DEFAULT 'not_started'`],
    ['poc_validation_status',    `VARCHAR(20) NOT NULL DEFAULT 'not_started'`],
    ['poc_outcome_status',       `VARCHAR(20) NOT NULL DEFAULT 'not_started'`],
    ['poc_qualification_notes',  `TEXT`],
    ['poc_env_setup_notes',      `TEXT`],
    ['poc_trial_notes',          `TEXT`],
    ['poc_validation_notes',     `TEXT`],
    ['poc_outcome_notes',        `TEXT`],
    ['poc_deadline',             `DATE`],
    ['poc_outcome',              `VARCHAR(20)`],
    ['poc_handoff_to',           `VARCHAR(255)`],
    ['poc_handoff_date',         `DATE`],
    ['poc_migration_speed',      `DECIMAL(10,2)`],
    ['poc_error_rate',           `DECIMAL(5,2)`],
    ['customer_contact',         `VARCHAR(255)`],
    ['poc_success_criteria',     `TEXT`],
    ['poc_data_volume',          `VARCHAR(255)`],
    ['poc_permissions_intact',   `BOOLEAN`],
    ['poc_metadata_intact',      `BOOLEAN`],
    ['poc_handoff_notes',        `TEXT`],
    // Phase-specific fields added for structured POC template
    ['poc_num_users',            `VARCHAR(100)`],
    ['poc_estimated_data',       `VARCHAR(100)`],
    ['poc_phase1_checklist',     `TEXT`],
    ['poc_tenant_access',        `VARCHAR(20)`],
    ['poc_tool_version',         `VARCHAR(100)`],
    ['poc_test_accounts',        `VARCHAR(255)`],
    ['poc_firewall_issues',      `VARCHAR(50)`],
    ['poc_phase2_checklist',     `TEXT`],
    ['poc_files_migrated',       `VARCHAR(100)`],
    ['poc_data_migrated_gb',     `DECIMAL(15,2)`],
    ['poc_errors_failed',        `VARCHAR(255)`],
    ['poc_phase3_checklist',     `TEXT`],
    ['poc_validation_date',      `DATE`],
    ['poc_issues_raised',        `VARCHAR(100)`],
    ['poc_customer_satisfaction',`VARCHAR(20)`],
    ['poc_phase4_checklist',     `TEXT`],
    ['poc_next_step',            `VARCHAR(255)`],
    ['poc_deal_value',           `DECIMAL(15,2)`],
    ['poc_phase5_checklist',     `TEXT`],
    ['poc_pre_sales_owner',      `VARCHAR(255)`],
  ];
  for (const [col, colType] of pocCols) {
    if (!await columnExists('projects', col)) {
      try { await execute(`ALTER TABLE projects ADD COLUMN ${col} ${colType}`); } catch {}
    }
  }

  // POC documents table
  await execute(`CREATE TABLE IF NOT EXISTS poc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'MOM',
    file_size BIGINT,
    mime_type VARCHAR(200),
    file_path TEXT NOT NULL,
    uploaded_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_poc_docs_project ON poc_documents(project_id)`); } catch {}

  // POC critical notes column
  if (!await columnExists('projects', 'poc_critical_notes')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN poc_critical_notes TEXT`); } catch {}
  }

  // Customer success entries (CSAT + CF product signal overrides)
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS customer_success_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(255) NOT NULL UNIQUE,
        csat_score DECIMAL(3,1),
        csat_verbatim TEXT,
        csat_migration_quality DECIMAL(3,1),
        csat_support_experience DECIMAL(3,1),
        csat_onboarding DECIMAL(3,1),
        csat_date DATE,
        cf_migrate_signal VARCHAR(20) DEFAULT 'none',
        cf_migrate_signal_reason TEXT,
        cf_manage_signal VARCHAR(20) DEFAULT 'none',
        cf_manage_signal_reason TEXT,
        cf_ps_signal VARCHAR(20) DEFAULT 'none',
        cf_ps_signal_reason TEXT,
        cf_ms_signal VARCHAR(20) DEFAULT 'none',
        cf_ms_signal_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch {}

  // Migration checklists table
  await execute(`CREATE TABLE IF NOT EXISTS migration_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    migration_type VARCHAR(20) NOT NULL,
    phase VARCHAR(20) NOT NULL,
    checklist_data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(30) NOT NULL DEFAULT 'not_started',
    submitted_by VARCHAR(255),
    submitted_at TIMESTAMP,
    verified_by VARCHAR(255),
    verified_at TIMESTAMP,
    pm_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, migration_type, phase)
  )`);
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_mig_chk_project ON migration_checklists(project_id)`); } catch {}
  // Rename legacy phase values to new 4-phase naming
  try { await execute(`UPDATE migration_checklists SET phase='pre_onetime' WHERE phase='onetime'`); } catch {}
  try { await execute(`UPDATE migration_checklists SET phase='pre_delta'   WHERE phase='delta'`);   } catch {}
  // Widen phase column to accommodate new phase names
  try { await execute(`ALTER TABLE migration_checklists ALTER COLUMN phase TYPE VARCHAR(30)`); } catch {}

  // Ensure account_manager allows NULL (needed before clearing invalid values)
  try { await execute(`ALTER TABLE projects ALTER COLUMN account_manager DROP NOT NULL`); } catch {}

  // Clear account manager values that are not in the approved list
  try {
    await execute(`
      UPDATE projects
      SET account_manager = NULL
      WHERE account_manager IS NOT NULL
        AND account_manager NOT IN ('Joy Prakash','Arundhati Sen','Anthony Raymond','Lennis Brown','Deepak R J')
    `);
  } catch {}

  // Archive projects that have phase=COMPLETED but no case study and no archived_at (legacy data)
  try {
    await execute(`
      UPDATE projects
      SET archived_at = NOW(), archive_reason = 'CASE_STUDY_COMPLETED', archived_by = 'system'
      WHERE phase = 'COMPLETED'
        AND archived_at IS NULL
        AND id NOT IN (SELECT project_id FROM case_studies)
    `);
  } catch {}

  // Archive columns — must exist before getAll filters on archived_at
  if (!await columnExists('projects', 'archived_at')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP NULL`); } catch {}
  }
  if (!await columnExists('projects', 'archive_reason')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN archive_reason VARCHAR(50) NULL`); } catch {}
  }
  if (!await columnExists('projects', 'archived_by')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN archived_by VARCHAR(100) NULL`); } catch {}
  }
  if (!await columnExists('projects', 'restore_count')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN restore_count INT NOT NULL DEFAULT 0`); } catch {}
  }

  // Server alert logs
  await execute(`CREATE TABLE IF NOT EXISTS server_alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    alert_type VARCHAR(20) NOT NULL,
    sent_to VARCHAR(500) NOT NULL,
    days_remaining INTEGER,
    days_overdue INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT NOW()
  )`);
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_alert_logs_project ON server_alert_logs(project_id)`); } catch {}

}

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    await runMigrations();
    logger.info('✅ Migrations completed');
  } catch (error) {
    logger.warn('Migration error (non-fatal):', error);
  }

  try {
    await authService.createDefaultAdmin();
  } catch (error) {
    logger.warn('Could not create default admin (may already exist)');
  }

  try {
    await templateService.seedDefaultTemplates();
  } catch (error) {
    logger.warn('Could not seed templates (may already exist)');
  }

  if (process.env.ENABLE_CRON_JOBS === 'true') {
    initializeCronJobs();
    logger.info('⏰ Cron jobs initialized');
  }
});

export default app;
