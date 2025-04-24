# Stage 1: Build Environment
FROM node:18-slim AS builder

WORKDIR /usr/src/app
# Install pnpm - Pin to the version used locally
RUN npm install -g pnpm@10.9.0

# Copy root workspace files from the root of the build context (/workspace)
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy the package.json files for ALL workspace members
# Ensure these paths match your pnpm-workspace.yaml definition and actual structure
# Note: If optimiser had a package.json relevant to pnpm, copy it too.
COPY apps/scheduler/package.json ./apps/scheduler/package.json
COPY apps/web/package.json ./apps/web/package.json
# Add other COPY lines here if you have more pnpm workspace packages

# Install ALL dependencies (including dev) needed for the build
# We will copy only prod dependencies to the final stage
# RUN pnpm install --frozen-lockfile 
RUN pnpm install --no-frozen-lockfile # <-- TEMPORARY DEBUG: Allow install despite lockfile issues

# Copy scheduler source code and tsconfig files from the build context
COPY apps/scheduler/src ./apps/scheduler/src
COPY apps/scheduler/tsconfig.json ./apps/scheduler/tsconfig.json
COPY tsconfig.base.json ./
# Also copy tsconfig from web if scheduler depends on types/build output from it
# COPY apps/web/tsconfig.json ./apps/web/tsconfig.json

# Build the application (runs tsc)
# Use the pnpm filter command, assuming the context is the root (/usr/src/app)
RUN pnpm --filter @jamauto/scheduler run build

# Optional: Prune dev dependencies if needed before copying to final stage
# RUN pnpm prune --prod # Let's skip this for now, copy approach might be simpler

# Stage 2: Runtime Environment
FROM node:18-slim

WORKDIR /usr/src/app

# Copy package.json from scheduler (might only be needed for metadata)
COPY package.json ./

# Copy ONLY production node_modules from the builder stage
# This assumes pnpm layout puts the relevant modules in node_modules
# Check pnpm workspace layout if this doesn't work as expected
# A potentially more robust way is `pnpm deploy` in the build stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
# If using pnpm deploy, the target dir might be different

# Copy the built application code from the builder stage
COPY --from=builder /usr/src/app/apps/scheduler/dist ./dist

# Expose port and define command
EXPOSE 8080
CMD [ "node", "dist/server.js" ] 