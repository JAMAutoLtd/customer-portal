# SIMULATION/nginx/Dockerfile
# Use the official Nginx image
FROM nginx:stable-alpine

# Remove the default Nginx configuration file
RUN rm /etc/nginx/conf.d/default.conf

# Copy the custom configuration file from the context to the container
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80 (Nginx default)
EXPOSE 80

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"] 