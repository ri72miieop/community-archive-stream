#!/bin/bash

echo "Setting up Native Messaging Host for macOS/Linux..."

# Get current directory
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Current directory: $CURRENT_DIR"

# Create manifest JSON (no backslash escaping needed on Unix)
cat > native_app_native_msg_host_manifest.json << EOF
{
  "name": "com.ca_browser_extension.native_app",
  "description": "Tweet Storage Native Host",
  "path": "$CURRENT_DIR/run_native.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://obbppbfflmgkbkgkcdmpnfcbllklpomc/",
    "chrome-extension://igclpobjpjlphgllncjcgaookmncegbk/"
  ]
}
EOF

echo "Created native_app_native_msg_host_manifest.json"

# Determine OS and set appropriate directories
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    EDGE_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
else
    # Linux
    CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    EDGE_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
fi

# Create directories and install manifest
mkdir -p "$CHROME_DIR" 2>/dev/null
mkdir -p "$EDGE_DIR" 2>/dev/null

cp native_app_native_msg_host_manifest.json "$CHROME_DIR/com.ca_browser_extension.native_app.json"
cp native_app_native_msg_host_manifest.json "$EDGE_DIR/com.ca_browser_extension.native_app.json"

echo "Installed manifest to:"
echo "  Chrome: $CHROME_DIR/com.ca_browser_extension.native_app.json"  
echo "  Edge: $EDGE_DIR/com.ca_browser_extension.native_app.json"

echo "Setup complete!"
