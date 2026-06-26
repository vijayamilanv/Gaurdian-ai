# Guardian AI: Personal Success Prediction Engine

Guardian AI is a multi-agent personal success prediction system that helps students and young professionals predict academic risks (burnout, backlogs) and career readiness (placement probability, skill gaps) and suggests time-boxed actionable roadmaps.

## Folder Structure

```
guardian-ai/
├── backend/            # Node.js + Fastify API (TypeScript + Prisma ORM + Zod)
├── frontend/           # React + TypeScript App (Vite + Tailwind CSS + Recharts)
├── ai-service/         # Python FastAPI service (Rule-based fallbacks + LLM multi-agents + RAG)
└── README.md
```

## Setup & Running Guide

### 1. Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database
- Python (v3.10 or higher)

---

### 2. Backend Setup

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration and configure your database URI:
   ```bash
   cp .env.example .env
   # Open .env and customize DATABASE_URL and JWT_SECRET
   ```
4. Run Prisma database migrations to create tables:
   ```bash
   npx prisma migrate dev
   ```
5. Start development API server:
   ```bash
   npm run dev
   ```
6. Run Backend Tests:
   ```bash
   npm run test
   ```

---

### 3. Frontend Setup

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```

---

### 4. AI Prediction Service (Python)

1. Navigate to the `ai-service/` directory:
   ```bash
   cd ai-service
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start FastAPI server:
   ```bash
   python main.py
   ```
   The service will boot on `http://localhost:8000`.

---

## Testing API Endpoints manually

You can test the signup and login endpoints using cURL:

### Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "Developer Test", "email": "dev@example.com", "password": "supersecretpassword"}'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@example.com", "password": "supersecretpassword"}'
```
