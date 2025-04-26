# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Ensure NODE_ENV is production for the build stage as well
ENV NODE_ENV=production

# Install pnpm (ensure version matches your project if specific)
# RUN npm install -g pnpm@9.6.0 # Or use the version from your packageManager field
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files necessary for installation
# Adapt these COPY commands based on actual dependencies
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy app-specific package.json and potentially others it depends on
COPY apps/web/package.json ./apps/web/package.json
# Example: If web depends on types from scheduler
# COPY apps/scheduler/package.json ./apps/scheduler/package.json
# COPY apps/scheduler/src/types ./apps/scheduler/src/types # Be specific

# Install ALL dependencies across the workspace needed for the build
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code for the web app
COPY apps/web ./apps/web

# Declare the build arguments so they can be used by the build process
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_NHTSA_API_URL

# Build the web application (ensure package name matches apps/web/package.json)
# The package name is likely '@jam-auto/web' based on your root package.json filter example
# Double check the actual name in apps/web/package.json if build fails
RUN pnpm --filter @jamauto/web build

# Stage 2: Production Runner
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# ENV NEXT_TELEMETRY_DISABLED 1 # Uncomment to disable Next.js telemetry

# Set user and group (optional but good practice)
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 nextjs
# USER nextjs

# Copy standalone output from the builder stage
COPY --from=builder /app/apps/web/.next/standalone ./
# Copy static assets
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# Copy public assets
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000

# Force CMD to be executed directly
ENTRYPOINT [""]

# Command using shell form
CMD node apps/web/server.js 