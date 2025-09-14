@echo off
echo Setting up Native Messaging Host...

REM Get current directory
set CURRENT_DIR=%~dp0
set JSON_PATH=%CURRENT_DIR:\=\\%

REM Generate the registry file with current directory (properly quoted)
echo Windows Registry Editor Version 5.00> install_generated.reg
echo [HKEY_CURRENT_USER\Software\Microsoft\Edge\NativeMessagingHosts\com.ca_browser_extension.native_app]>> install_generated.reg
echo @="%JSON_PATH%native_app_native_msg_host_manifest.json">> install_generated.reg

REM Also generate one for Chrome
REM echo.>> install_generated.reg
REM echo [HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.ca_browser_extension.native_app]>> install_generated.reg  
REM echo @="%JSON_PATH%native_app_native_msg_host_manifest.json">> install_generated.reg
echo Installation for chrome is disabled for now
echo Generated install_generated.reg with current paths.
echo Registry will point to: %JSON_PATH%native_app_native_msg_host_manifest.json
echo.

REM Update native_app_native_msg_host_manifest.json with current directory

echo {> native_app_native_msg_host_manifest.json
echo   "name": "com.ca_browser_extension.native_app",>> native_app_native_msg_host_manifest.json
echo   "description": "Tweet Storage Native Host",>> native_app_native_msg_host_manifest.json
echo   "path": "%JSON_PATH%run_native.bat",>> native_app_native_msg_host_manifest.json
echo   "type": "stdio",>> native_app_native_msg_host_manifest.json
echo   "allowed_origins": [>> native_app_native_msg_host_manifest.json
echo     "chrome-extension://obbppbfflmgkbkgkcdmpnfcbllklpomc/",>> native_app_native_msg_host_manifest.json
echo     "chrome-extension://igclpobjpjlphgllncjcgaookmncegbk/">> native_app_native_msg_host_manifest.json
echo   ]>> native_app_native_msg_host_manifest.json
echo }>> native_app_native_msg_host_manifest.json

echo Updated native_app_native_msg_host_manifest.json with current paths.
echo JSON manifest path points to: %JSON_PATH%run_native.bat
echo.
echo To complete setup:
echo 1. Run: regedit install_generated.reg
echo 2. Or double-click install_generated.reg and approve
echo.
pause
