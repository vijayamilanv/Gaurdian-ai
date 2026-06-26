import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { server } from "../server.js";

describe("Profile API", () => {
  let userToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    try {
      await server.db.user.deleteMany({});
    } catch (e) {
      // Ignored if DB is not migrated
    }

    // Set up a test user and get their token
    const signupResponse = await server.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        name: "Alice Builder",
        email: "alice@example.com",
        password: "password123",
      },
    });

    const data = JSON.parse(signupResponse.body);
    userToken = data.token;
  });

  it("should return empty profile initially", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/profile",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.profile).toBeNull();
    expect(data.skills).toEqual([]);
    expect(data.projects).toEqual([]);
  });

  it("should successfully update and retrieve profile details", async () => {
    // Update profile
    const updateResponse = await server.inject({
      method: "PUT",
      url: "/api/profile",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
      payload: {
        cgpa: 8.5,
        attendance: 90.0,
        dsaSolved: 120,
        targetRoles: ["Frontend Engineer", "Fullstack Developer"],
        skills: [
          { skillName: "TypeScript", proficiency: 5 },
          { skillName: "React", proficiency: 4 },
        ],
        projects: [
          {
            title: "Project Tracker",
            description: "A tracking application",
            techStack: ["React", "Node", "Prisma"],
          },
        ],
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    // Retrieve updated profile
    const getResponse = await server.inject({
      method: "GET",
      url: "/api/profile",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(getResponse.statusCode).toBe(200);
    const data = JSON.parse(getResponse.body);
    expect(data.profile.cgpa).toBe(8.5);
    expect(data.profile.attendance).toBe(90.0);
    expect(data.profile.dsaSolved).toBe(120);
    expect(data.profile.targetRoles).toContain("Frontend Engineer");

    expect(data.skills.length).toBe(2);
    expect(data.skills[0].skillName).toBe("TypeScript");
    expect(data.skills[0].proficiency).toBe(5);

    expect(data.projects.length).toBe(1);
    expect(data.projects[0].title).toBe("Project Tracker");
    expect(data.projects[0].techStack).toContain("Prisma");
  });
});
