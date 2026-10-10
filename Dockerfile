FROM node:22-alpine

WORKDIR /app

# Copy application source
COPY package.json ./
COPY server.js ./
COPY src/ ./src/

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/var/data/evently.db

# Expose HTTP port
EXPOSE 4000

# Persistent SQLite data lives at /var/data. Attach a Railway volume with mount path /var/data to the service.

CMD ["node", "--no-warnings", "server.js"]
