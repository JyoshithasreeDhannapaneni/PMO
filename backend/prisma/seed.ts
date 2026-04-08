import { PrismaClient, PlanType, ProjectPhase, ProjectStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.notification.deleteMany();
  await prisma.caseStudy.deleteMany();
  await prisma.projectPhaseRecord.deleteMany();
  await prisma.project.deleteMany();

  // Sample projects
  const projects = [
    {
      name: 'Acme Corp Cloud Migration',
      customerName: 'Acme Corporation',
      projectManager: 'John Smith',
      accountManager: 'Sarah Johnson',
      planType: 'PLATINUM' as PlanType,
      plannedStart: new Date('2026-01-15'),
      plannedEnd: new Date('2026-04-15'),
      actualStart: new Date('2026-01-15'),
      sourcePlatform: 'On-Premise VMware',
      targetPlatform: 'AWS',
      estimatedCost: 150000,
      phase: 'MIGRATION' as ProjectPhase,
      status: 'ACTIVE' as ProjectStatus,
      description: 'Full infrastructure migration from on-premise VMware to AWS cloud.',
    },
    {
      name: 'TechStart SaaS Migration',
      customerName: 'TechStart Inc',
      projectManager: 'Emily Davis',
      accountManager: 'Michael Brown',
      planType: 'GOLD' as PlanType,
      plannedStart: new Date('2026-02-01'),
      plannedEnd: new Date('2026-03-20'),
      actualStart: new Date('2026-02-01'),
      sourcePlatform: 'Legacy CRM',
      targetPlatform: 'Salesforce',
      estimatedCost: 75000,
      phase: 'VALIDATION' as ProjectPhase,
      status: 'ACTIVE' as ProjectStatus,
      description: 'CRM migration from legacy system to Salesforce.',
    },
    {
      name: 'GlobalBank Data Center Move',
      customerName: 'Global Bank Ltd',
      projectManager: 'Robert Wilson',
      accountManager: 'Jennifer Lee',
      planType: 'PLATINUM' as PlanType,
      plannedStart: new Date('2025-11-01'),
      plannedEnd: new Date('2026-02-28'),
      actualStart: new Date('2025-11-01'),
      actualEnd: new Date('2026-03-15'),
      sourcePlatform: 'Private Data Center',
      targetPlatform: 'Azure',
      estimatedCost: 500000,
      actualCost: 520000,
      phase: 'COMPLETED' as ProjectPhase,
      status: 'COMPLETED' as ProjectStatus,
      description: 'Complete data center migration to Azure cloud.',
      delayDays: 15,
      delayStatus: 'DELAYED',
    },
    {
      name: 'RetailMax E-commerce Platform',
      customerName: 'RetailMax',
      projectManager: 'Amanda Chen',
      accountManager: 'David Martinez',
      planType: 'SILVER' as PlanType,
      plannedStart: new Date('2026-03-01'),
      plannedEnd: new Date('2026-05-30'),
      actualStart: new Date('2026-03-01'),
      sourcePlatform: 'Magento 1',
      targetPlatform: 'Shopify Plus',
      estimatedCost: 45000,
      phase: 'KICKOFF' as ProjectPhase,
      status: 'ACTIVE' as ProjectStatus,
      description: 'E-commerce platform migration from Magento to Shopify.',
    },
    {
      name: 'HealthCare Plus EHR Migration',
      customerName: 'HealthCare Plus',
      projectManager: 'Dr. Lisa Thompson',
      accountManager: 'Chris Anderson',
      planType: 'GOLD' as PlanType,
      plannedStart: new Date('2026-01-10'),
      plannedEnd: new Date('2026-04-10'),
      actualStart: new Date('2026-01-10'),
      sourcePlatform: 'Legacy EHR',
      targetPlatform: 'Epic Systems',
      estimatedCost: 200000,
      phase: 'MIGRATION' as ProjectPhase,
      status: 'ON_HOLD' as ProjectStatus,
      description: 'Electronic Health Records system migration.',
      notes: 'On hold pending regulatory approval.',
    },
    {
      name: 'EduTech Learning Platform',
      customerName: 'EduTech Solutions',
      projectManager: 'Mark Johnson',
      accountManager: 'Sarah Johnson',
      planType: 'BRONZE' as PlanType,
      plannedStart: new Date('2026-02-15'),
      plannedEnd: new Date('2026-03-15'),
      actualStart: new Date('2026-02-15'),
      sourcePlatform: 'Moodle',
      targetPlatform: 'Canvas LMS',
      estimatedCost: 25000,
      phase: 'CLOSURE' as ProjectPhase,
      status: 'ACTIVE' as ProjectStatus,
      description: 'Learning management system migration.',
    },
  ];

  // Create projects with phases
  for (const projectData of projects) {
    const project = await prisma.project.create({
      data: projectData as any,
    });

    // Create phase records
    const totalDays = Math.ceil(
      (new Date(projectData.plannedEnd).getTime() - new Date(projectData.plannedStart).getTime()) / 
      (1000 * 60 * 60 * 24)
    );

    const phases = [
      { name: 'KICKOFF', dayOffset: 0, status: 'COMPLETED' },
      { name: 'MIGRATION', dayOffset: Math.floor(totalDays * 0.2), status: projectData.phase === 'KICKOFF' ? 'PENDING' : 'COMPLETED' },
      { name: 'VALIDATION', dayOffset: Math.floor(totalDays * 0.7), status: ['KICKOFF', 'MIGRATION'].includes(projectData.phase) ? 'PENDING' : 'COMPLETED' },
      { name: 'CLOSURE', dayOffset: Math.floor(totalDays * 0.9), status: projectData.phase === 'CLOSURE' ? 'IN_PROGRESS' : (projectData.phase === 'COMPLETED' ? 'COMPLETED' : 'PENDING') },
    ];

    for (const phase of phases) {
      const plannedDate = new Date(projectData.plannedStart);
      plannedDate.setDate(plannedDate.getDate() + phase.dayOffset);

      await prisma.projectPhaseRecord.create({
        data: {
          projectId: project.id,
          phaseName: phase.name as ProjectPhase,
          plannedDate,
          actualDate: phase.status === 'COMPLETED' ? plannedDate : null,
          status: phase.status as any,
        },
      });
    }

    // Create case study for completed project
    if (projectData.status === 'COMPLETED') {
      await prisma.caseStudy.create({
        data: {
          projectId: project.id,
          title: `Case Study: ${projectData.name}`,
          status: 'PENDING',
          content: `Successful migration project for ${projectData.customerName}.`,
        },
      });
    }

    console.log(`  ✓ Created project: ${project.name}`);
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
