import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
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
import { initializeCronJobs } from './jobs';
import { logger } from './utils/logger';
import { authService } from './services/authService';
import { templateService } from './services/templateService';

dotenv.config();

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

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  
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
