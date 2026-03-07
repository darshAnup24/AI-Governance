import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
})

// Request interceptor: inject JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('aigw_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    config.headers['X-Request-ID'] = crypto.randomUUID()
    return config
})

// Response interceptor: handle 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('aigw_token')
            localStorage.removeItem('aigw_user')
            window.location.href = '/login'
        }
        return Promise.reject(error)
    }
)

export default api
