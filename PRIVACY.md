# Privacy Policy & Data Handling

## 1. Local Execution
TestForge (this MCP Server) executes **entirely locally** on the user's machine. The author ("TestForge") does not collect, receive, or store:
- Your source code
- Your generated test scripts
- Your `.env` credentials
- Your proprietary application URLs
- Execution logs or bug reports
- App binaries (.apk/.ipa/.app)

## 2. LLM Provider (Third-Party)
Because this is an MCP Server, its output is sent directly to your configured Large Language Model (LLM) client (e.g., Claude Desktop, Cursor, or your local agent). 
- TestForge is not responsible for the privacy practices of your chosen LLM provider. 
- Ensure your organization has a zero-retention / zero-training agreement with your LLM provider if you are testing highly sensitive internal applications.

## 3. UI Hierarchy & Visual Inspection
When using tools like `inspect_ui_hierarchy` or running mobile tests, the server may capture XML hierarchy trees and Base64 screenshots. These artifacts remain on your local disk or are sent temporarily to your local MCP Client session. They are **never** transmitted to the author's servers.

## 4. No Telemetry
There is no hidden telemetry or "phone home" analytics built into this open-source core. You are entirely in control of the data flow.
