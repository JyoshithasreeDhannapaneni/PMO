import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { execute, query } from './config/db';
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
import { logger } from './utils/logger';
import { authService } from './services/authService';
import { templateService } from './services/templateService';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
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
app.use('/api/pmo-settings', pmoSettingsRoutes);
app.use('/api/archive', archiveRoutes);

// Error handling
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
  // ALTER existing columns to wider types — safe to retry
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

  // ADD new columns only if they don't exist
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

  // Archive columns
  try { await execute(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL`); } catch {}
  try { await execute(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(50) NULL`); } catch {}
  try { await execute(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by VARCHAR(100) NULL`); } catch {}
  try { await execute(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS restore_count INT NOT NULL DEFAULT 0`); } catch {}
}

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Run DB migrations (e.g. widen ENUM columns to VARCHAR for dynamic phases/plan types)
  await runMigrations();

  // Create default admin user
  try {
    await authService.createDefaultAdmin();
  } catch (error) {
    logger.warn('Could not create default admin (may already exist)');
  }
  
  // Seed default templates
  try {
    await templateService.seedDefaultTemplates();
  } catch (error) {
    logger.warn('Could not seed templates (may already exist)');
  }
  
  // Initialize background jobs
  if (process.env.ENABLE_CRON_JOBS === 'true') {
    initializeCronJobs();
    logger.info('⏰ Cron jobs initialized');
  }
});

export default app;
