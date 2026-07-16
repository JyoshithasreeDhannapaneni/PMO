import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { viewerReadOnly } from './middleware/viewerReadOnly';
import { query, execute, pool } from './config/db';
import { schema as dbSchema } from './db/init';

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
import pmoSettingsRoutes from './routes/pmoSettingsRoutes';
import archiveRoutes from './routes/archiveRoutes';
import { initializeCronJobs } from './jobs';
import settingsRoutes from './routes/settingsRoutes';
import accountManagerRoutes from './routes/accountManagerRoutes';
import customerSuccessRoutes from './routes/customerSuccessRoutes';
import pocDocumentsRoutes from './routes/pocDocumentsRoutes';
import migrationChecklistRoutes from './routes/migrationChecklistRoutes';
import serverAlertRoutes from './routes/serverAlertRoutes';
import templateCombinationRoutes from './routes/templateCombinationRoutes';
import jiraRoutes from './routes/jiraRoutes';
import hubspotRoutes from './routes/hubspotRoutes';
import { isHubspotConfigured, getDealsByCustomer } from './services/hubspotService';
import psEngagementsRoutes from './routes/psEngagementsRoutes';
import externalRoutes from './routes/externalRoutes';
import aiRoutes from './routes/aiRoutes';
import apiKeyRoutes from './routes/apiKeyRoutes';
import clientReviewRoutes from './routes/clientReviewRoutes';
import platformReviewRoutes from './routes/platformReviewRoutes';
import dealDeskRoutes from './routes/dealDeskRoutes';
import ticketingRoutes from './routes/ticketingRoutes';
import { ntaSyncService, isNtaConfigured } from './services/ntaSyncService';
import { logger } from './utils/logger';
import { authService } from './services/authService';
import { templateService } from './services/templateService';
import { projectService } from './services/projectService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
// serve uploaded poc documents
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.status(204).end());

// Global read-only gate for VIEWER role — see middleware/viewerReadOnly.ts.
// Applied once here so it covers every route file, since most of them don't
// check role themselves.
app.use(viewerReadOnly);

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
app.use('/api/external', externalRoutes);
app.use('/api/api-key', apiKeyRoutes);
app.use('/api/reviews', clientReviewRoutes);
app.use('/api/platform-reviews', platformReviewRoutes);
app.use('/api/smtp', smtpRoutes);
app.use('/api/pmo-settings', pmoSettingsRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/account-manager', accountManagerRoutes);
app.use('/api/customer-success', customerSuccessRoutes);
app.use('/api/poc-documents', pocDocumentsRoutes);
app.use('/api/migration-checklists', migrationChecklistRoutes);
app.use('/api/server-alerts', serverAlertRoutes);
app.use('/api/template-combinations', templateCombinationRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/hubspot', hubspotRoutes);
app.use('/api/ps-engagements', psEngagementsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/deal-desk', dealDeskRoutes);
app.use('/api/ticketing', ticketingRoutes);

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
  // Convert ENUM columns to VARCHAR so queries can use values like 'CLOSED','DECOMMISSIONED'
  // that are not in the original ENUM definition without throwing a type error.
  const alterStatements = [
    `ALTER TABLE projects ALTER COLUMN phase TYPE VARCHAR(50)`,
    `ALTER TABLE projects ALTER COLUMN status TYPE VARCHAR(50)`,
    `ALTER TABLE projects ALTER COLUMN delay_status TYPE VARCHAR(50)`,
    `ALTER TABLE projects ALTER COLUMN plan_type TYPE VARCHAR(50)`,
    `ALTER TABLE projects ALTER COLUMN migration_types TYPE VARCHAR(500)`,
    `ALTER TABLE projects ALTER COLUMN source_platform TYPE VARCHAR(500)`,
    `ALTER TABLE projects ALTER COLUMN target_platform TYPE VARCHAR(500)`,
  ];
  for (const sql of alterStatements) {
    try { await execute(sql); } catch { /* already correct type — ignore */ }
  }

  // Archive columns must exist BEFORE any migration that references archived_at
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
  // Manually-flagged "at risk" — separate from the auto-computed delayStatus
  // (deadline within 7 days), so a PM can flag a project early even when the
  // date math hasn't caught up yet, mirroring how is_escalated already works.
  if (!await columnExists('projects', 'is_at_risk')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN is_at_risk BOOLEAN NOT NULL DEFAULT false`); } catch {}
  }
  if (!await columnExists('projects', 'at_risk_notes')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN at_risk_notes TEXT DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'at_risk_marked_at')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN at_risk_marked_at TIMESTAMP DEFAULT NULL`); } catch {}
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

  // Ensure bharath.tummaganti@cloudfuze.com is always ADMIN
  try { await execute(`UPDATE users SET role = 'ADMIN' WHERE email = 'bharath.tummaganti@cloudfuze.com'`); } catch {}

  // Updated roles constraint including PROJECT_MANAGER
  try {
    await execute(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await execute(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','PROJECT_MANAGER','VIEWER','PRE_SALES','ACCOUNT_MANAGER'))`);
  } catch {}

  // Segment (ENT/SMB) — set directly per project rather than inferred from PM name
  if (!await columnExists('projects', 'segment')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN segment VARCHAR(10) DEFAULT NULL`); } catch {}
  }

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
        customer_name VARCHAR(255),
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
  // Add project_id to customer_success_entries (per-project keying)
  try { await execute(`ALTER TABLE customer_success_entries ADD COLUMN IF NOT EXISTS project_id UUID`); } catch {}
  try { await execute(`ALTER TABLE customer_success_entries DROP CONSTRAINT IF EXISTS customer_success_entries_customer_name_key`); } catch {}
  try { await execute(`ALTER TABLE customer_success_entries ADD CONSTRAINT cse_project_id_unique UNIQUE (project_id)`); } catch {}
  try { await execute(`ALTER TABLE customer_success_entries ALTER COLUMN customer_name DROP NOT NULL`); } catch {}

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

  // Onetime migration progress (stored as integer: 10, 20, ..., 90)
  if (!await columnExists('projects', 'onetime_progress')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN onetime_progress SMALLINT DEFAULT NULL`); } catch {}
  }

  // Customer Success manager and CSAT score columns
  if (!await columnExists('projects', 'customer_success')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN customer_success VARCHAR(255) DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'csat_score')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN csat_score DECIMAL(3,1) DEFAULT NULL`); } catch {}
  }
  if (!await columnExists('projects', 'delay_happened')) {
    try { await execute(`ALTER TABLE projects ADD COLUMN delay_happened VARCHAR(50) DEFAULT NULL`); } catch {}
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

  // Heal projects that were incorrectly marked COMPLETED due to the phase-code bug
  // (a phase renamed to e.g. "Delta" kept code='COMPLETED', so selecting it set status=COMPLETED).
  // Only resets projects that have NO case study and are NOT archived — those were never
  // intentionally completed; projects with a real case study or archived_at are left untouched.
  try {
    await execute(`
      UPDATE projects
      SET status = 'ACTIVE'
      WHERE status = 'COMPLETED'
        AND archived_at IS NULL
        AND id NOT IN (SELECT project_id FROM case_studies)
    `);
  } catch {}

  // Template combination documents (Templates tab)
  await execute(`CREATE TABLE IF NOT EXISTS template_combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_category VARCHAR(20) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    target_name VARCHAR(255) NOT NULL,
    source_icon VARCHAR(10) DEFAULT '📂',
    target_icon VARCHAR(10) DEFAULT '☁️',
    is_custom BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS template_combination_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combination_id UUID NOT NULL REFERENCES template_combinations(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    doc_type VARCHAR(100) NOT NULL DEFAULT 'other',
    file_size BIGINT,
    mime_type VARCHAR(200),
    file_path TEXT NOT NULL,
    uploaded_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_tmpl_combo_cat ON template_combinations(migration_category)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_tmpl_combo_docs ON template_combination_documents(combination_id)`); } catch {}

  // Professional Services engagements
  await execute(`CREATE TABLE IF NOT EXISTS ps_engagements (
    id VARCHAR(64) PRIMARY KEY,
    client_name VARCHAR(255) NOT NULL,
    sow_ref_id VARCHAR(100),
    client_contact VARCHAR(255),
    client_contact_email VARCHAR(255),
    cf_ps_lead VARCHAR(255),
    account_manager VARCHAR(255),
    start_date VARCHAR(20),
    end_date VARCHAR(20),
    engagement_type VARCHAR(100),
    workloads JSONB DEFAULT '[]',
    delivery_model VARCHAR(100),
    priority VARCHAR(50),
    sow_status VARCHAR(100) DEFAULT 'Draft',
    engagement_description TEXT,
    client_objectives TEXT,
    success_criteria TEXT,
    assumptions TEXT,
    out_of_scope TEXT,
    phases JSONB DEFAULT '[]',
    signoffs JSONB DEFAULT '[]',
    line_items JSONB DEFAULT '[]',
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await execute(`ALTER TABLE ps_engagements ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'`);

  // Client reviews (Reviews tab) — structured customer feedback scorecard per project
  await execute(`CREATE TABLE IF NOT EXISTS client_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reviewer_name VARCHAR(255) NOT NULL,
    review_date DATE NOT NULL DEFAULT CURRENT_DATE,
    communication_score SMALLINT NOT NULL CHECK (communication_score BETWEEN 1 AND 5),
    delivery_score SMALLINT NOT NULL CHECK (delivery_score BETWEEN 1 AND 5),
    quality_score SMALLINT NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
    support_score SMALLINT NOT NULL CHECK (support_score BETWEEN 1 AND 5),
    comments TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_client_reviews_project ON client_reviews(project_id)`); } catch {}

  // Platform reviews (Reviews tab) — reviews pulled in from external sites
  // (Gartner, G2, Trustpilot, TrustRadius, or any custom platform an admin adds),
  // matched to a project by name. project_id is nullable since a platform review
  // may reference a customer/project that doesn't have a matching internal record.
  await execute(`CREATE TABLE IF NOT EXISTS platform_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(100) NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    project_name VARCHAR(255) NOT NULL,
    project_manager VARCHAR(255),
    account_manager VARCHAR(255),
    reviewer_name VARCHAR(255),
    rating DECIMAL(3,1) NOT NULL CHECK (rating BETWEEN 0 AND 5),
    review_text TEXT,
    review_url TEXT,
    review_date DATE NOT NULL DEFAULT CURRENT_DATE,
    segment VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  if (!await columnExists('platform_reviews', 'project_manager')) {
    try { await execute(`ALTER TABLE platform_reviews ADD COLUMN project_manager VARCHAR(255)`); } catch {}
  }
  if (!await columnExists('platform_reviews', 'account_manager')) {
    try { await execute(`ALTER TABLE platform_reviews ADD COLUMN account_manager VARCHAR(255)`); } catch {}
  }
  if (!await columnExists('platform_reviews', 'segment')) {
    try { await execute(`ALTER TABLE platform_reviews ADD COLUMN segment VARCHAR(10)`); } catch {}
  }
  // media_items holds an array of { url, type } for the testimonial's attached
  // images/videos — replaced the earlier single media_url/media_type columns
  // so a review can carry multiple images and a video together.
  if (!await columnExists('platform_reviews', 'media_items')) {
    try { await execute(`ALTER TABLE platform_reviews ADD COLUMN media_items JSONB DEFAULT '[]'`); } catch {}
  }
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_platform_reviews_platform ON platform_reviews(platform)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_platform_reviews_project ON platform_reviews(project_id)`); } catch {}

  // App settings table
  try {
    await execute(`CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
  } catch {}

  // Deal Desk email inbox tables
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS deal_desk_emails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id VARCHAR(1000) UNIQUE NOT NULL,
        subject TEXT,
        sender_email VARCHAR(300),
        sender_name VARCHAR(300),
        received_at TIMESTAMP,
        has_attachments BOOLEAN DEFAULT false,
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS deal_desk_deals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email_id UUID NOT NULL REFERENCES deal_desk_emails(id) ON DELETE CASCADE,
        source_filename VARCHAR(500),
        customer_name VARCHAR(300),
        sow_ref VARCHAR(200),
        deal_value DECIMAL(15,2),
        deal_status VARCHAR(100),
        signer_name VARCHAR(300),
        signed_at TIMESTAMP,
        line_items JSONB DEFAULT '[]',
        matched_ps_id VARCHAR(64),
        matched_project_id UUID,
        match_type VARCHAR(50),
        match_confidence VARCHAR(20),
        extracted_text TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_deal_desk_deals_email ON deal_desk_deals(email_id)`);
    await execute(`CREATE INDEX IF NOT EXISTS idx_deal_desk_deals_status ON deal_desk_deals(deal_status)`);
    await execute(`CREATE INDEX IF NOT EXISTS idx_deal_desk_emails_msg ON deal_desk_emails(message_id)`);
  } catch {}

  // HubSpot snapshot cache — singleton row; survives backend restarts
  await execute(`CREATE TABLE IF NOT EXISTS hubspot_cache (
    singleton   BOOLEAN PRIMARY KEY DEFAULT TRUE,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data        JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`);

  // NTA ticket cache table — all reads come from here, synced every 5 minutes
  await execute(`CREATE TABLE IF NOT EXISTS nta_tickets (
    key          VARCHAR(100) PRIMARY KEY,
    summary      TEXT,
    status_name  VARCHAR(100),
    status_category VARCHAR(50),
    priority     VARCHAR(100),
    assignee_name VARCHAR(255),
    reporter_name VARCHAR(255),
    customer_name VARCHAR(255),
    department   VARCHAR(255),
    project_manager VARCHAR(255),
    space_key    VARCHAR(100),
    space_name   VARCHAR(255),
    created_at   TIMESTAMP,
    updated_at   TIMESTAMP,
    raw          JSONB NOT NULL DEFAULT '{}',
    synced_at    TIMESTAMP DEFAULT NOW()
  )`);
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_nta_assignee  ON nta_tickets(assignee_name)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_nta_customer  ON nta_tickets(customer_name)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_nta_pm        ON nta_tickets(project_manager)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_nta_space     ON nta_tickets(space_key)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_nta_created   ON nta_tickets(created_at)`); } catch {}
  try { await execute(`CREATE INDEX IF NOT EXISTS idx_nta_status_cat ON nta_tickets(status_category)`); } catch {}

}

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    const schemaClient = await pool.connect();
    await schemaClient.query(dbSchema);
    schemaClient.release();
    logger.info('✅ Schema initialized');
  } catch (err) {
    logger.warn('Schema init warning (non-fatal):', err);
  }

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

  try {
    const refreshed = await projectService.updateAllDelays();
    logger.info(`🔄 Delay recalculation on startup: ${refreshed} projects updated`);
  } catch (error) {
    logger.warn('Startup delay recalculation failed (non-fatal):', error);
  }

  if (process.env.ENABLE_CRON_JOBS === 'true') {
    initializeCronJobs();
    logger.info('⏰ Cron jobs initialized');
  }

  if (isNtaConfigured()) {
    ntaSyncService.getDbCount().then((count) => {
      logger.info(`NTA tickets DB: ${count} tickets stored. Use POST /api/ticketing/sync to sync manually.`);
    }).catch(() => {});
  }

  // HubSpot background refresh — pull once on startup then every 15 minutes
  if (isHubspotConfigured()) {
    getDealsByCustomer(true).then(() => {
      logger.info('✅ HubSpot initial data loaded');
    }).catch((err) => logger.warn('[HubSpot] Initial fetch failed:', err));

    // node-cron is already a project dependency (used by initializeCronJobs)
    import('node-cron').then((cron) => {
      cron.default.schedule('*/15 * * * *', () => {
        getDealsByCustomer(true).catch((err) => logger.warn('[HubSpot] Cron refresh failed:', err));
      });
      logger.info('⏰ HubSpot: auto-refresh every 15 minutes');
    }).catch(() => {});
  }
});

export default app;
