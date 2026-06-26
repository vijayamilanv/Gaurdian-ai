import { create } from 'zustand'

interface User {
  id: string
  name: string
  email: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: (user, token) => {
    localStorage.setItem('guardian_token', token)
    localStorage.setItem('guardian_user', JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('guardian_token')
    localStorage.removeItem('guardian_user')
    set({ user: null, token: null, isAuthenticated: false })
  },

  hydrate: () => {
    const token = localStorage.getItem('guardian_token')
    const userJson = localStorage.getItem('guardian_user')
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as User
        set({ user, token, isAuthenticated: true })
      } catch {
        localStorage.removeItem('guardian_token')
        localStorage.removeItem('guardian_user')
      }
    }
  },
}))
