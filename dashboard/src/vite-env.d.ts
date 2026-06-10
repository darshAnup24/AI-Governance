/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string
    readonly VITE_GOVERNANCE_URL: string
    readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare const __AIRLOCK_DEMO_MODE__: string
