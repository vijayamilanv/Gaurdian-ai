import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import Notes from './pages/Notes'
import MockInterview from './pages/MockInterview'
import AptitudePrep from './pages/AptitudePrep'
import Files from './pages/Files'
import ResumeReview from './pages/ResumeReview'
import Schedule from './pages/Schedule'
import MockInterviewReport from './pages/MockInterviewReport'
import GmailInbox from './pages/GmailInbox'
import ExamPrep from './pages/ExamPrep'
import HealthDiet from './pages/HealthDiet'
import GuardianCompanion from './pages/GuardianCompanion'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { hydrate, isAuthenticated } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/onboarding"    element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/applications"  element={<ProtectedRoute><Applications /></ProtectedRoute>} />
      <Route path="/applications/:id" element={<ProtectedRoute><Applications /></ProtectedRoute>} />
      <Route path="/notes"         element={<ProtectedRoute><Notes /></ProtectedRoute>} />
      <Route path="/files"         element={<ProtectedRoute><Files /></ProtectedRoute>} />
      <Route path="/resume-review"  element={<ProtectedRoute><ResumeReview /></ProtectedRoute>} />
      <Route path="/schedule"       element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
      <Route path="/mock-interview/:sessionId/report" element={<ProtectedRoute><MockInterviewReport /></ProtectedRoute>} />
      <Route path="/gmail"         element={<ProtectedRoute><GmailInbox /></ProtectedRoute>} />
      <Route path="/exam"          element={<ProtectedRoute><ExamPrep /></ProtectedRoute>} />
      <Route path="/health"        element={<ProtectedRoute><HealthDiet /></ProtectedRoute>} />
      <Route path="/companion"      element={<ProtectedRoute><GuardianCompanion /></ProtectedRoute>} />
      <Route path="/mock-interview" element={<ProtectedRoute><MockInterview /></ProtectedRoute>} />
      <Route path="/prep"          element={<ProtectedRoute><AptitudePrep /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
