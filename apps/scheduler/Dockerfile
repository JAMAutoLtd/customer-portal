# Stage 1: Build the application
FROM node:22-slim AS builder
WORKDIR /usr/src/app

# Install pnpm
RUN npm install -g pnpm@10.9.0

# Copy dependency definition files
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/scheduler/package.json ./apps/scheduler/package.json
# Add other workspace package.json files if scheduler depends on them directly
# e.g., COPY apps/common-types/package.json ./apps/common-types/package.json

# Install ALL dependencies (including dev) needed for the build
# Using --frozen-lockfile is recommended in CI/CD
RUN pnpm install --frozen-lockfile

# Copy necessary source code
COPY tsconfig.base.json ./
COPY apps/scheduler/tsconfig.json ./apps/scheduler/tsconfig.json
COPY apps/scheduler/src ./apps/scheduler/src
# Add other workspace source code if scheduler depends on them directly
# e.g., COPY apps/common-types/src ./apps/common-types/src

# Build the scheduler application
RUN pnpm --filter @jamauto/scheduler run build

# Prune dev dependencies and prepare for deployment
# This creates a deployable node_modules structure within the specified target directory
# Adding --legacy flag due to pnpm v10+ default behavior (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE)
RUN pnpm --filter @jamauto/scheduler deploy --prod --legacy apps/scheduler/deploy


# Stage 2: Production image
FROM node:22-slim AS final
WORKDIR /usr/src/app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy ONLY the necessary production assets from the builder stage
COPY --from=builder /usr/src/app/apps/scheduler/deploy/package.json ./package.json
COPY --from=builder /usr/src/app/apps/scheduler/deploy/node_modules ./node_modules
COPY --from=builder /usr/src/app/apps/scheduler/dist ./dist

# Expose the port the app runs on
# Cloud Run uses the PORT environment variable automatically
EXPOSE 8080

# Start the server using the compiled JavaScript entry point
# apps/scheduler/Dockerfile - Change the CMD line

# Add Node.js flags for heap dump on unhandled rejection and pending async ops
CMD ["node", "--trace-warnings", "--unhandled-rejections=throw", "--pending-deprecation", "dist/server.js"]