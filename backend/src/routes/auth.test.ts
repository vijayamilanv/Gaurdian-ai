import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { server } from "../server.js";

describe("Authentication & Profile API", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    try {
      await server.db.user.deleteMany({});
    } catch (e) {
      // Ignored if DB is not migrated yet
    }
  });

  it("should fail validation if signup parameters are invalid", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        name: "A",
        email: "not-an-email",
        password: "123",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should successfully sign up a new user, block duplicates, and log in", async () => {
    // 1. Sign up
    const signupResponse = await server.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        name: "John Doe",
        email: "john@example.com",
        password: "securepassword",
      },
    });

    expect(signupResponse.statusCode).toBe(201);
    const signupData = JSON.parse(signupResponse.body);
    expect(signupData).toHaveProperty("token");
    expect(signupData.user.name).toBe("John Doe");
    expect(signupData.user.email).toBe("john@example.com");
    expect(signupData.user).toHaveProperty("id");

    // 2. Duplicate registration attempt
    const duplicateResponse = await server.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        name: "John Duplicate",
        email: "john@example.com",
        password: "differentpassword",
      },
    });

    expect(duplicateResponse.statusCode).toBe(400);
    const dupData = JSON.parse(duplicateResponse.body);
    expect(dupData.message).toContain("already registered");

    // 3. Log in with wrong credentials
    const wrongLoginResponse = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "john@example.com",
        password: "wrongpassword",
      },
    });

    expect(wrongLoginResponse.statusCode).toBe(401);

    // 4. Log in with correct credentials
    const loginResponse = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "john@example.com",
        password: "securepassword",
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginData = JSON.parse(loginResponse.body);
    expect(loginData).toHaveProperty("token");
    expect(loginData.user.email).toBe("john@example.com");

    // 5. Access /me without token
    const noTokenResponse = await server.inject({
      method: "GET",
      url: "/api/auth/me",
    });
    expect(noTokenResponse.statusCode).toBe(401);

    // 6. Access /me with valid token
    const meResponse = await server.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: `Bearer ${loginData.token}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    const meData = JSON.parse(meResponse.body);
    expect(meData.user.email).toBe("john@example.com");
  });
});
