import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Upsert demo user — safe to re-run without breaking login
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.upsert({
    where: { email: "demo@guardianai.dev" },
    update: { name: "Demo Student", passwordHash },
    create: {
      name: "Demo Student",
      email: "demo@guardianai.dev",
      passwordHash,
    },
  });

  // Clean this user's related data before re-seeding
  await prisma.prediction.deleteMany({ where: { userId: user.id } });
  await prisma.activity.deleteMany({ where: { userId: user.id } });
  await prisma.skill.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { userId: user.id } });
  await prisma.profile.deleteMany({ where: { userId: user.id } });

  // Create profile
  await prisma.profile.create({
    data: {
      userId: user.id,
      cgpa: 7.8,
      attendance: 82,
      dsaSolved: 95,
      targetRoles: ["Software Engineer", "Full Stack Developer"],
    },
  });

  // Create skills
  await prisma.skill.createMany({
    data: [
      { userId: user.id, skillName: "JavaScript", proficiency: 4 },
      { userId: user.id, skillName: "React", proficiency: 4 },
      { userId: user.id, skillName: "Node.js", proficiency: 3 },
      { userId: user.id, skillName: "Python", proficiency: 3 },
      { userId: user.id, skillName: "SQL", proficiency: 3 },
    ],
  });

  // Create projects
  await prisma.project.createMany({
    data: [
      {
        userId: user.id,
        title: "E-Commerce Platform",
        description: "Full stack online shopping app with payment integration",
        techStack: ["React", "Node.js", "PostgreSQL", "Stripe"],
      },
      {
        userId: user.id,
        title: "DSA Visualizer",
        description: "Interactive visualizer for common data structures and algorithms",
        techStack: ["React", "TypeScript", "Canvas API"],
      },
    ],
  });

  // Create activity logs (last 7 days)
  const today = new Date();
  const activityData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    activityData.push(
      { userId: user.id, type: "coding", hours: 3 + Math.random() * 2, date },
      { userId: user.id, type: "study", hours: 2 + Math.random(), date },
      { userId: user.id, type: "sleep", hours: 6 + Math.random() * 2, date }
    );
  }
  await prisma.activity.createMany({ data: activityData });

  // Create initial predictions
  await prisma.prediction.createMany({
    data: [
      { userId: user.id, riskType: "placement", probability: 0.68 },
      { userId: user.id, riskType: "backlog", probability: 0.12 },
      { userId: user.id, riskType: "burnout", probability: 0.34 },
      { userId: user.id, riskType: "project_failure", probability: 0.15 },
    ],
  });

  console.log("✅ Seed complete!");
  console.log("   Demo user: demo@guardianai.dev / demo1234");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
