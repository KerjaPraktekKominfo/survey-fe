# Survey Pemkot Jogja FE

Frontend React + TypeScript + Vite untuk aplikasi Survey PemKot Jogja.

## Prasyarat

- Node.js
- npm
- Backend `survey-general-api`

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Default `.env`:

```env
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://survey-general-api.test
```

Jika backend tidak memakai vhost, ubah `VITE_API_PROXY_TARGET`, contoh:

```env
VITE_API_PROXY_TARGET=http://localhost
```

## Command

```powershell
npm run dev
npm run build
npm run lint
npm run preview
```
