#!/usr/bin/env bun
import { spawn } from "node:child_process";

interface TestMessage {
  action: string;
  tweet?: any;
  sql?: string;
  [key: string]: any;
}

async function testNativeApp(message: TestMessage, scriptPath: string): Promise<any> {
  console.log(`Testing message: ${JSON.stringify(message)}`);
  
  return new Promise((resolve, reject) => {
    // Start the native app
    const process = spawn('bun', ['run', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let responseReceived = false;
    
    function readNativeMessage(stdout: NodeJS.ReadableStream): Promise<any> {
      return new Promise((resolve) => {
        const lengthBuffer = Buffer.alloc(4);
        let lengthBytesRead = 0;
        
        const readLength = () => {
          const chunk = stdout.read(4 - lengthBytesRead);
          if (chunk) {
            chunk.copy(lengthBuffer, lengthBytesRead);
            lengthBytesRead += chunk.length;
            
            if (lengthBytesRead === 4) {
              const messageLength = lengthBuffer.readUInt32LE(0);
              if (messageLength === 0) {
                resolve(null);
                return;
              }
              
              // Read the message
              const messageBuffer = Buffer.alloc(messageLength);
              let messageBytesRead = 0;
              
              const readMessage = () => {
                const chunk = stdout.read(messageLength - messageBytesRead);
                if (chunk) {
                  chunk.copy(messageBuffer, messageBytesRead);
                  messageBytesRead += chunk.length;
                  
                  if (messageBytesRead === messageLength) {
                    try {
                      const messageStr = messageBuffer.toString('utf-8');
                      resolve(JSON.parse(messageStr));
                    } catch (error) {
                      resolve(null);
                    }
                  } else {
                    stdout.once('readable', readMessage);
                  }
                } else {
                  stdout.once('readable', readMessage);
                }
              };
              
              readMessage();
            } else {
              stdout.once('readable', readLength);
            }
          } else {
            stdout.once('readable', readLength);
          }
        };
        
        stdout.once('readable', readLength);
      });
    }
    
    function sendNativeMessage(stdin: NodeJS.WritableStream, message: TestMessage): void {
      const messageStr = JSON.stringify(message);
      const messageBuffer = Buffer.from(messageStr, 'utf-8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
      
      stdin.write(lengthBuffer);
      stdin.write(messageBuffer);
    }
    
    // Handle process events
    process.on('error', (error) => {
      console.log(`Process error: ${error}`);
      reject(error);
    });
    
    process.on('close', (code) => {
      if (!responseReceived) {
        console.log(`Process closed with code: ${code}`);
        resolve(null);
      }
    });
    
    // Wait for startup message then send test message
    readNativeMessage(process.stdout!)
      .then(startupMessage => {
        console.log(`Startup message: ${JSON.stringify(startupMessage)}`);
        
        // Send our test message
        sendNativeMessage(process.stdin!, message);
        
        // Read response
        return readNativeMessage(process.stdout!);
      })
      .then(response => {
        console.log(`Response: ${JSON.stringify(response)}`);
        responseReceived = true;
        
        // Close stdin to signal end
        process.stdin!.end();
        
        resolve(response);
      })
      .catch(error => {
        console.log(`Error: ${error}`);
        process.kill();
        reject(error);
      });
  });
}

async function runTests() {
  console.log("=== Testing Bun Native App ===");
  
  try {
    // Test ping
    console.log("\n1. Testing ping:");
    await testNativeApp({ action: "ping" }, "native_app.ts");
    
    // Test invalid action  
    console.log("\n2. Testing invalid action:");
    await testNativeApp({ action: "invalid" }, "native_app.ts");
    
    // Test get_stats
    console.log("\n3. Testing get_stats:");
    await testNativeApp({ action: "get_stats" }, "native_app.ts");
    
    // Test store_tweet with new TweetData structure
    console.log("\n4. Testing store_tweet with new TweetData structure:");
    const testTweetData = {
      originator_id: "test_tweet_123",
      timestamp: "2025-09-10T13:30:00.000Z",
      type: "HomeTimeline",
      data: { text: "This is a test tweet", user: { screen_name: "test_user" } },
      user_id: "user_456",
      canSendToCA: true,
      reason: null,
      date_added: "2025-09-10T13:30:00.000Z"
    };
    await testNativeApp({ action: "store_tweet", tweet: testTweetData }, "native_app.ts");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTests();
