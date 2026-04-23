import axios from "axios";

const govApi = axios.create({
    baseURL: import.meta.env.VITE_GOVERNANCE_URL || "http://localhost:4000",
    headers: { "Content-Type": "application/json" },
});

// Attach JWT on every request
govApi.interceptors.request.use((config) => {
    const token = localStorage.getItem("shieldai_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Auto-refresh or redirect on 401
govApi.interceptors.response.use(
    (res) => res,
    async (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem("shieldai_token");
            window.location.href = "/login";
        }
        return Promise.reject(err);
    }
);

export default govApi;
