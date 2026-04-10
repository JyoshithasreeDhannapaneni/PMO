import { query, execute, pool } from '../config/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function seed() {
  logger.info('🌱 Seeding database...');

  try {
    // Check if admin exists
    const adminCheck = await query(
      "SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1"
    );

    if (adminCheck.rows.length === 0) {
      const adminId = uuidv4();
      await execute(
        `INSERT INTO users (id, name, username, email, password, role) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [adminId, 'Administrator', 'admin', 'admin@company.com', hashPassword('admin2026'), 'ADMIN']
      );
      logger.info('✅ Default admin user created (admin / admin2026)');
    } else {
      logger.info('Admin user already exists');
    }

    // Check if templates exist
    const templateCheck = await query('SELECT COUNT(*) as count FROM migration_templates');
    
    if (parseInt(templateCheck.rows[0].count) === 0) {
      // Content Migration Template
      const contentTemplateId = uuidv4();
      await execute(
        `INSERT INTO migration_templates (id, name, code, description) 
         VALUES (?, ?, ?, ?)`,
        [contentTemplateId, 'Content Migration Template', 'CONTENT', 'Standard template for content migration projects (SharePoint, File Servers, etc.)']
      );

      const contentPhases = [
        { name: 'Phase 1: Initiation', orderIndex: 0, duration: 7, tasks: [
          { name: 'Kick off call', orderIndex: 0, duration: 1, isMilestone: true },
          { name: 'Pre-requisites', orderIndex: 1, duration: 5, isMilestone: false },
          { name: 'Access provisioning', orderIndex: 2, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 2: Infrastructure Setup', orderIndex: 1, duration: 14, tasks: [
          { name: 'Server Creation', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'Server Sanity', orderIndex: 1, duration: 2, isMilestone: false },
          { name: 'Cloud Adding', orderIndex: 2, duration: 3, isMilestone: false },
          { name: 'User & Channel Mapping', orderIndex: 3, duration: 5, isMilestone: false },
        ]},
        { name: 'Phase 3: Migration Execution', orderIndex: 2, duration: 21, tasks: [
          { name: 'Pilot Migration', orderIndex: 0, duration: 5, isMilestone: true },
          { name: 'One Time Migration', orderIndex: 1, duration: 10, isMilestone: false },
          { name: 'Delta Migration', orderIndex: 2, duration: 5, isMilestone: false },
        ]},
        { name: 'Phase 4: Validation', orderIndex: 3, duration: 7, tasks: [
          { name: 'Data Validation', orderIndex: 0, duration: 3, isMilestone: false },
          { name: 'User Acceptance Testing', orderIndex: 1, duration: 3, isMilestone: false },
          { name: 'Final Validation', orderIndex: 2, duration: 1, isMilestone: true },
        ]},
        { name: 'Phase 5: Closure', orderIndex: 4, duration: 3, tasks: [
          { name: 'Documentation', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'Project Closure', orderIndex: 1, duration: 1, isMilestone: true },
        ]},
      ];

      for (const phase of contentPhases) {
        const phaseId = uuidv4();
        await execute(
          `INSERT INTO template_phases (id, template_id, name, order_index, default_duration) 
           VALUES (?, ?, ?, ?, ?)`,
          [phaseId, contentTemplateId, phase.name, phase.orderIndex, phase.duration]
        );
        
        for (const task of phase.tasks) {
          await execute(
            `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, is_milestone) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), phaseId, task.name, task.orderIndex, task.duration, task.isMilestone]
          );
        }
      }

      // Email Migration Template
      const emailTemplateId = uuidv4();
      await execute(
        `INSERT INTO migration_templates (id, name, code, description) 
         VALUES (?, ?, ?, ?)`,
        [emailTemplateId, 'Email Migration Template', 'EMAIL', 'Standard template for email migration projects (Exchange, Gmail, etc.)']
      );

      const emailPhases = [
        { name: 'Phase 1: Initiation', orderIndex: 0, duration: 5, tasks: [
          { name: 'Kick off call', orderIndex: 0, duration: 1, isMilestone: true },
          { name: 'Requirements gathering', orderIndex: 1, duration: 2, isMilestone: false },
          { name: 'Migration planning', orderIndex: 2, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 2: Pre-Migration Setup', orderIndex: 1, duration: 10, tasks: [
          { name: 'Source environment assessment', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'Target environment setup', orderIndex: 1, duration: 3, isMilestone: false },
          { name: 'User provisioning', orderIndex: 2, duration: 3, isMilestone: false },
          { name: 'Coexistence configuration', orderIndex: 3, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 3: Migration Execution', orderIndex: 2, duration: 14, tasks: [
          { name: 'Pilot batch migration', orderIndex: 0, duration: 3, isMilestone: true },
          { name: 'Batch 1 migration', orderIndex: 1, duration: 3, isMilestone: false },
          { name: 'Batch 2 migration', orderIndex: 2, duration: 3, isMilestone: false },
          { name: 'Final batch migration', orderIndex: 3, duration: 3, isMilestone: false },
          { name: 'Delta sync', orderIndex: 4, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 4: Post-Migration', orderIndex: 3, duration: 7, tasks: [
          { name: 'Mail flow validation', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'User validation', orderIndex: 1, duration: 2, isMilestone: false },
          { name: 'MX record cutover', orderIndex: 2, duration: 1, isMilestone: true },
          { name: 'Decommission source', orderIndex: 3, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 5: Closure', orderIndex: 4, duration: 3, tasks: [
          { name: 'Documentation', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'Project Closure', orderIndex: 1, duration: 1, isMilestone: true },
        ]},
      ];

      for (const phase of emailPhases) {
        const phaseId = uuidv4();
        await execute(
          `INSERT INTO template_phases (id, template_id, name, order_index, default_duration) 
           VALUES (?, ?, ?, ?, ?)`,
          [phaseId, emailTemplateId, phase.name, phase.orderIndex, phase.duration]
        );
        
        for (const task of phase.tasks) {
          await execute(
            `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, is_milestone) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), phaseId, task.name, task.orderIndex, task.duration, task.isMilestone]
          );
        }
      }

      // Messaging Migration Template
      const messagingTemplateId = uuidv4();
      await execute(
        `INSERT INTO migration_templates (id, name, code, description) 
         VALUES (?, ?, ?, ?)`,
        [messagingTemplateId, 'Messaging Migration Template', 'MESSAGING', 'Standard template for messaging migration projects (Slack to Teams, etc.)']
      );

      const messagingPhases = [
        { name: 'Phase 1: Initiation', orderIndex: 0, duration: 5, tasks: [
          { name: 'Kick off call', orderIndex: 0, duration: 1, isMilestone: true },
          { name: 'Scope definition', orderIndex: 1, duration: 2, isMilestone: false },
          { name: 'Channel inventory', orderIndex: 2, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 2: Infrastructure Setup', orderIndex: 1, duration: 10, tasks: [
          { name: 'Teams provisioning', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'Channel mapping', orderIndex: 1, duration: 3, isMilestone: false },
          { name: 'User mapping', orderIndex: 2, duration: 3, isMilestone: false },
          { name: 'Bot/App migration planning', orderIndex: 3, duration: 2, isMilestone: false },
        ]},
        { name: 'Phase 3: Migration Execution', orderIndex: 2, duration: 14, tasks: [
          { name: 'Pilot channel migration', orderIndex: 0, duration: 3, isMilestone: true },
          { name: 'Public channels migration', orderIndex: 1, duration: 4, isMilestone: false },
          { name: 'Private channels migration', orderIndex: 2, duration: 4, isMilestone: false },
          { name: 'Direct messages migration', orderIndex: 3, duration: 3, isMilestone: false },
        ]},
        { name: 'Phase 4: Validation', orderIndex: 3, duration: 5, tasks: [
          { name: 'Content validation', orderIndex: 0, duration: 2, isMilestone: false },
          { name: 'User acceptance testing', orderIndex: 1, duration: 2, isMilestone: false },
          { name: 'Sign-off', orderIndex: 2, duration: 1, isMilestone: true },
        ]},
        { name: 'Phase 5: Closure', orderIndex: 4, duration: 3, tasks: [
          { name: 'Training', orderIndex: 0, duration: 1, isMilestone: false },
          { name: 'Documentation', orderIndex: 1, duration: 1, isMilestone: false },
          { name: 'Project Closure', orderIndex: 2, duration: 1, isMilestone: true },
        ]},
      ];

      for (const phase of messagingPhases) {
        const phaseId = uuidv4();
        await execute(
          `INSERT INTO template_phases (id, template_id, name, order_index, default_duration) 
           VALUES (?, ?, ?, ?, ?)`,
          [phaseId, messagingTemplateId, phase.name, phase.orderIndex, phase.duration]
        );
        
        for (const task of phase.tasks) {
          await execute(
            `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, is_milestone) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), phaseId, task.name, task.orderIndex, task.duration, task.isMilestone]
          );
        }
      }

      logger.info('✅ Default templates seeded successfully');
    } else {
      logger.info('Templates already exist, skipping seed');
    }

    logger.info('✅ Database seeding completed');
  } catch (error) {
    logger.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch(console.error);
