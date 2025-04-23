# Use an official Node.js runtime as a parent image
# Choose a version compatible with your project (e.g., Node 18 or 20 LTS)
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install dependencies using package-lock.json for reproducible builds
# Copy only necessary files first to leverage Docker cache
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Copy the rest of the application code (pre-built JS from 'dist')
# This assumes `npm run build` was run *before* building the image
COPY dist ./dist
COPY package.json ./

# Make port 8080 available to the world outside this container
# Cloud Run uses the PORT env var, but EXPOSE is good practice
EXPOSE 8080

# Define the command to run the app
# Assumes your compiled server entry point is dist/server.js
CMD [ "node", "dist/server.js" ] 