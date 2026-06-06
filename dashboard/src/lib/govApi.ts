import axios from "axios";

const govApi = axios.create({
    baseURL: import.meta.env.VITE_GOVERNANCE_URL || "http://localhost:4000",
    headers: { "Content-Type": "application/json" },
});

// Attach JWT on every request
govApi.interceptors.request.use((config) => {
    const token = localStorage.getItem("airlock_token") || localStorage.getItem("aigw_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    const workspaceId = localStorage.getItem("airlock_workspace_id");
    const environmentId = localStorage.getItem("airlock_environment_id");
    if (workspaceId) config.headers["X-Workspace-ID"] = workspaceId;
    if (environmentId) config.headers["X-Environment-ID"] = environmentId;
    return config;
});

// Auto-refresh or redirect on 401
govApi.interceptors.response.use(
    (res) => res,
    async (err) => {
        const originalRequest = err.config;
        if (err.response?.status === 401 && !originalRequest?._retry) {
            const refreshToken = localStorage.getItem("airlock_refresh_token");
            if (refreshToken) {
                try {
                    originalRequest._retry = true;
                    const refreshResponse = await axios.post(
                        `${govApi.defaults.baseURL}/api/auth/refresh`,
                        { refreshToken },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                "X-Workspace-ID": localStorage.getItem("airlock_workspace_id") || "",
                            },
                        },
                    );
                    const newAccessToken = refreshResponse.data.accessToken;
                    const newRefreshToken = refreshResponse.data.refreshToken;
                    if (newAccessToken) {
                        localStorage.setItem("airlock_token", newAccessToken);
                        localStorage.setItem("aigw_token", newAccessToken);
                        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    }
                    if (newRefreshToken) {
                        localStorage.setItem("airlock_refresh_token", newRefreshToken);
                    }
                    return govApi(originalRequest);
                } catch {
                    // Fall through to logout below.
                }
            }
            localStorage.removeItem("airlock_token");
            localStorage.removeItem("aigw_token");
            localStorage.removeItem("airlock_user");
            localStorage.removeItem("aigw_user");
            localStorage.removeItem("airlock_refresh_token");
            localStorage.removeItem("airlock_workspace_id");
            localStorage.removeItem("airlock_environment_id");
            window.location.href = "/login";
        }
        return Promise.reject(err);
    }
);

export default govApi;
