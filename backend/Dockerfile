# Build stage
FROM public.ecr.aws/docker/library/node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM public.ecr.aws/docker/library/node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy migrations folder
COPY --from=builder /app/src/migrations ./dist/migrations

# Create uploads directory
RUN mkdir -p uploads logs

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
