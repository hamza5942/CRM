This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## CRM workspace setup

1. Start the backend API from `D:\Codex CRM\backend` with `npm start`. Configure its MongoDB URI and JWT secret in the backend `.env`.
2. Copy `.env.example` to `.env.local` in this frontend folder. Set `NEXT_PUBLIC_API_URL` to the backend origin (default `http://localhost:5000`).
3. Start the frontend with `npm run dev` and open [http://localhost:3000](http://localhost:3000).
4. Sign in with the administrator account created by the backend's `npm run create-admin` script. Use the **Employees** navigation item to create employee accounts. Employees can then sign in with the email and initial password set by the administrator.

The frontend uses `POST /api/auth/login` to authenticate and the protected `POST /api/auth/register` endpoint to create employee accounts. The backend's `CORS_ORIGINS` must include the frontend origin. For production, set `NEXT_PUBLIC_API_URL` to the deployed API origin and allow the deployed frontend origin in the backend CORS configuration.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

This frontend is a Next.js app and can be deployed as a separate Vercel project from the backend.

1. Import the CRM repository into Vercel and set **Root Directory** to `frontend/frontend`.
2. Set the Vercel project environment variable `NEXT_PUBLIC_API_URL` to the backend deployment origin, for example `https://your-backend.vercel.app`. Do not append `/api`.
3. Deploy the frontend. The browser sends API requests to `${NEXT_PUBLIC_API_URL}/api/...`.
4. Add the deployed frontend origin (for example `https://your-frontend.vercel.app`) to the backend's `CORS_ORIGINS` environment variable, then redeploy the backend if you change it.

Set `NEXT_PUBLIC_API_URL` before deploying; otherwise the local development fallback (`http://localhost:5000`) will be used. For local development, keep using that default or set it in `.env.local`.

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details about deploying Next.js apps.
