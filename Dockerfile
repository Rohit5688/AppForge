# Dockerfile for Appium-Cucumber-POM-MCP
# Uses Node base image. Appium and WebdriverIO will be executed natively within the container.
# Note: This image contains the MCP server and Node dependencies. To test against local mobile emulators (Android/iOS), 
# you must configure the Docker container to access the host machine's network (e.g., --add-host=host.docker.internal:host-gateway).

FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# The MCP server runs on stdio by default.
# Port 3100 is exposed for the SSE transport option.
EXPOSE 3100

# Entry point
ENTRYPOINT ["node", "dist/index.js"]
