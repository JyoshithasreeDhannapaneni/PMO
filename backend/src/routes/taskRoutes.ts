import { Router } from 'express';
import { taskController } from '../controllers/taskController';

const router = Router();

// GET /api/tasks/project/:projectId - Get all tasks for a project (grouped by phase)
router.get('/project/:projectId', taskController.getProjectTasks);

// GET /api/tasks/project/:projectId/gantt - Get Gantt chart data
router.get('/project/:projectId/gantt', taskController.getGanttData);

// POST /api/tasks/project/:projectId/from-template - Create tasks from template
router.post('/project/:projectId/from-template', taskController.createFromTemplate);

// GET /api/tasks/:taskId - Get single task
router.get('/:taskId', taskController.getTaskById);

// PUT /api/tasks/:taskId - Update task
router.put('/:taskId', taskController.updateTask);

// PATCH /api/tasks/:taskId/status - Update task status only
router.patch('/:taskId/status', taskController.updateTaskStatus);

export default router;
