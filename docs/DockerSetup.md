# 🐳 Dockerized Appium-Cucumber MCP Server

The Appium-Cucumber MCP Server can be fully dockerized for consistent local development and remote team collaboration. Using the official `node` image ensures that all OS-level dependencies for WebdriverIO execution are standardized.

---

## 🏗️ 1. Building the Image

Clone the repository and build the Docker image locally:

```bash
docker build -t mcp-appium-cucumber .
```

*Note: The image contains the full Node.js environment, the MCP server, and its dependencies. It does **NOT** contain the Android Emulator or iOS Simulator, nor the Appium Desktop Server (which must be run on the host).*

---

## 🏠 2. Running Locally (Stdio for local codebases)

If you are running the MCP Server to analyze and generate code for a **local project on your machine**, you must run the container using `stdio` and **mount your local project** into the container as a volume.

### Example Run Command:
```bash
docker run -i --rm \
  -v /path/to/your/project:/app/workspace \
  mcp-appium-cucumber
```

*   `-i`: Keeps STDIN open even if not attached (Required for MCP `stdio` communication).
*   `-v`: Mounts your local project folder to `/app/workspace` inside the container.
*   **Important**: When using MCP tools on this container, ensure the `projectRoot` arguments you pass to the tools are matching the mounted path (e.g., `/app/workspace`).

### Connecting to Host Appium Server & Devices:
Since the Appium server (`appium -p 4723`) and Emulators run on your host machine (not inside the Docker container), you must allow the container to reach the host's networking loopback interface:

```bash
docker run -i --rm \
  --add-host=host.docker.internal:host-gateway \
  -v /path/to/project:/app/workspace \
  mcp-appium-cucumber
```

Then, in your project's `mcp-config.json` capability profiles, set your Appium URL or Remote Host to point to the host gateway and define the correct devices:

```json
"mobile": {
  "capabilitiesProfiles": {
    "docker_to_host_android": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "emulator-5554",
      "mcp:appiumHost": "http://host.docker.internal:4723"
    }
  }
}
```

---

## 🌐 3. Running Remotely (SSE over HTTP)

If you are deploying this MCP server to a cloud provider so a remote team can use it to generate Appium code, you should run it using the **SSE (Server-Sent Events)** transport.

```bash
docker run -p 3100:3100 -d mcp-appium-cucumber --transport sse --port 3100 --host 0.0.0.0
```

### Configuring a Remote MCP Client:
Most MCP clients (like Claude Desktop or Cursor) support registering Server-Sent Event endpoints natively. Add the following to your AI client configuration file:

```json
{
  "mcpServers": {
    "remote-appium-mcp": {
      "type": "sse",
      "url": "https://mcp.your-domain.com/sse"
    }
  }
}
```

---

## 📂 4. Best Practices for Dockerized Mobile Testing

1.  **Mounting the AI Brain**: To ensure the AI's "Learning" is persistent across container restarts, mount the `.appium-mcp` knowledge folder as a volume:
    ```bash
    -v /path/to/project/.appium-mcp:/app/workspace/.appium-mcp
    ```
2.  **Environment Secrets**: Pass Cloud Device testing credentials (e.g., BrowserStack, Sauce Labs, LambdaTest) via Docker environment variables instead of hardcoding them:
    ```bash
    -e BROWSERSTACK_USER=myuser -e BROWSERSTACK_KEY=mykey
    ```
3.  **Host Permissions**: If you encounter file-write permission errors on Linux host machines when the MCP server generates `.ts` or `.feature` files, force Docker to run as your local user:
    ```bash
    --user $(id -u):$(id -g)
    ```
