#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { appendFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

interface TweetData {
  originator_id: string;
  timestamp: string;
  type: string;
  data: any;
  user_id: string;
  canSendToCA?: boolean;
  reason?: string;
  date_added: string;
}

interface NativeMessage {
  action: string;
  tweet?: TweetData;
  sql?: string;
  format?: 'json' | 'csv';
  [key: string]: any;
}

interface NativeResponse {
  status: 'success' | 'error';
  id?: string;
  results?: any[];
  count?: number;
  error?: string;
  type?: string;
  stats?: {
    total: number;
    size: number;
    call_count: number;
  };
  action?: string;
}

// Optimized logging with reduced I/O overhead
const DEBUG_MODE = process.env.NODE_ENV === 'development' || process.argv.includes('--debug');
let logBuffer: string[] = [];
let logFlushTimeout: NodeJS.Timeout | null = null;

async function logDebug(message: string): Promise<void> {
  if (!DEBUG_MODE) return; // Skip logging in production
  
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -1);
  const logMessage = `[${timestamp}] ${message}`;
  
  logBuffer.push(logMessage);
  
  // Flush buffer every 5 seconds or when it gets large
  if (logBuffer.length >= 10 || !logFlushTimeout) {
    if (logFlushTimeout) {
      clearTimeout(logFlushTimeout);
    }
    
    logFlushTimeout = setTimeout(async () => {
      if (logBuffer.length > 0) {
        try {
          await appendFile('native_app_debug.log', logBuffer.join('\n') + '\n');
          logBuffer = [];
        } catch (error) {
          // Fail silently if logging fails
        }
      }
      logFlushTimeout = null;
    }, 100); // Small delay to batch writes
  }
}

// Flush logs on exit
async function flushLogs(): Promise<void> {
  if (logBuffer.length > 0) {
    try {
      await appendFile('native_app_debug.log', logBuffer.join('\n') + '\n');
      logBuffer = [];
    } catch (error) {
      // Fail silently
    }
  }
}

await logDebug("=== Native app starting ===");

// Read message from stdin - optimized version
function readMessage(): Promise<NativeMessage | null> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Set a reasonable timeout for message reading
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(null); // Timeout - likely extension disconnected
    }, 30000); // 30 second timeout
    
    // Read 4-byte length first
    const lengthBuffer = Buffer.alloc(4);
    let lengthBytesRead = 0;
    
    const readLength = () => {
      const chunk = stdin.read(4 - lengthBytesRead);
      if (chunk) {
        chunk.copy(lengthBuffer, lengthBytesRead);
        lengthBytesRead += chunk.length;
        
        if (lengthBytesRead === 4) {
          const messageLength = lengthBuffer.readUInt32LE(0);
          
          if (messageLength === 0 || messageLength > 1024 * 1024) { // Max 1MB message
            cleanup();
            resolve(null);
            return;
          }
          
          // Read the message
          const messageBuffer = Buffer.alloc(messageLength);
          let messageBytesRead = 0;
          
          const readMessageData = () => {
            const chunk = stdin.read(messageLength - messageBytesRead);
            if (chunk) {
              chunk.copy(messageBuffer, messageBytesRead);
              messageBytesRead += chunk.length;
              
              if (messageBytesRead === messageLength) {
                cleanup();
                try {
                  const messageStr = messageBuffer.toString('utf-8');
                  const parsed = JSON.parse(messageStr);
                  resolve(parsed);
                } catch (error) {
                  logDebug(`JSON parse error: ${error}`);
                  resolve(null);
                }
              } else {
                stdin.once('readable', readMessageData);
              }
            } else {
              stdin.once('readable', readMessageData);
            }
          };
          
          readMessageData();
        } else {
          stdin.once('readable', readLength);
        }
      } else if (lengthBytesRead === 0) {
        // No data available, likely end of stream
        cleanup();
        resolve(null);
      } else {
        stdin.once('readable', readLength);
      }
    };
    
    // Handle stdin end/error events
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    
    const onError = (error: Error) => {
      cleanup();
      logDebug(`Stdin error: ${error.message}`);
      resolve(null);
    };
    
    stdin.once('end', onEnd);
    stdin.once('error', onError);
    stdin.once('readable', readLength);
  });
}

// Optimized message sending with better error handling
async function sendMessage(message: NativeResponse): Promise<void> {
  try {
    await logDebug(`Sending: ${message.status} ${message.action || message.type || ''}`);
    
    const messageStr = JSON.stringify(message);
    const messageBuffer = Buffer.from(messageStr, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
    
    // Write synchronously to avoid race conditions
    const success1 = process.stdout.write(new Uint8Array(lengthBuffer));
    const success2 = process.stdout.write(new Uint8Array(messageBuffer));
    
    if (!success1 || !success2) {
      await logDebug("Stdout buffer full, waiting for drain");
      await new Promise<void>((resolve) => {
        process.stdout.once('drain', resolve);
      });
    }
    
  } catch (error) {
    await logDebug(`Send error: ${error}`);
    await cleanupAndExit();
  }
}

async function cleanupAndExit(): Promise<void> {
  await logDebug("Cleaning up and exiting");
  await flushLogs(); // Ensure all logs are written
  
  // Clear inactivity timeout
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = null;
  }
  
  try {
    if (db) {
      db.close();
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
  
  process.exit(0);
}

await logDebug("Initializing database...");

// Initialize SQLite database in the data folder
// Since the batch file changes to the script directory, cwd() will be correct
const dataDir = join(process.cwd(), 'data');
const dbPath = join(dataDir, 'tweets.db');

// Ensure the data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

await logDebug(`Database path: ${dbPath}`);
const db = new Database(dbPath);

// Create table with new schema
db.run(`
  CREATE TABLE IF NOT EXISTS tweets (
    originator_id TEXT PRIMARY KEY,
    timestamp TEXT,
    type TEXT,
    data TEXT,
    user_id TEXT,
    canSendToCA BOOLEAN,
    reason TEXT,
    date_added TEXT
  )
`);

await logDebug("Database initialized, sending ready message...");

// Send initial ready message
await sendMessage({ status: 'success', type: 'startup' });
let callCount = 0;

await logDebug("Entering main loop...");

// Optimized main message loop with better resource management
let isShuttingDown = false;
let lastActivityTime = Date.now();
let inactivityTimeout: NodeJS.Timeout | null = null;

// Inactivity timeout - close app after 5 minutes of no communication
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function resetInactivityTimer(): void {
  lastActivityTime = Date.now();
  
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  
  inactivityTimeout = setTimeout(async () => {
    await logDebug('No activity for 5 minutes, shutting down due to inactivity');
    isShuttingDown = true;
    await cleanupAndExit();
  }, INACTIVITY_TIMEOUT_MS);
}

function updateActivity(): void {
  resetInactivityTimer();
}

// Start the inactivity timer
resetInactivityTimer();

// Handle graceful shutdown signals
process.on('SIGINT', async () => {
  await logDebug('Received SIGINT, shutting down gracefully');
  isShuttingDown = true;
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  await cleanupAndExit();
});

process.on('SIGTERM', async () => {
  await logDebug('Received SIGTERM, shutting down gracefully');
  isShuttingDown = true;
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  await cleanupAndExit();
});

// Prepare database statements once for better performance
const insertTweetStmt = db.prepare(`
  INSERT OR REPLACE INTO tweets 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const countStmt = db.prepare('SELECT COUNT(*) as count FROM tweets');

try {
  // Main message loop - optimized for efficiency
  while (!isShuttingDown) {
    const message = await readMessage();
    
    if (message === null) {
      await logDebug("Connection closed or timeout, exiting");
      break;
    }
    
    // Update activity timer on any message received
    updateActivity();
    await logDebug(`Processing: ${message.action}`);
    
    try {
      switch (message.action) {
        case 'store_tweet':
          const tweet = message.tweet!;
          
          // Extract and validate data
          const originator_id = tweet.originator_id || '';
          const timestamp = tweet.timestamp || '';
          const tweet_type = tweet.type || '';
          
          // Optimize data serialization
          let data: string;
          if (typeof tweet.data === 'string') {
            data = tweet.data;
          } else if (tweet.data) {
            data = JSON.stringify(tweet.data);
          } else {
            data = '';
          }
          
          const user_id = tweet.user_id || '';
          const canSendToCA = tweet.canSendToCA ?? null;
          const reason = tweet.reason || null;
          const date_added = tweet.date_added || '';
          
          // Use prepared statement for better performance
          insertTweetStmt.run(originator_id, timestamp, tweet_type, data, user_id, canSendToCA, reason, date_added);
          await sendMessage({ status: 'success', id: originator_id });
          break;
          
        case 'query':
          const sql = message.sql || '';
          if (sql) {
            try {
              const stmt = db.prepare(sql);
              const results = stmt.all();
              await sendMessage({ status: 'success', results });
            } catch (sqlError) {
              await sendMessage({ status: 'error', error: `SQL error: ${sqlError}` });
            }
          } else {
            await sendMessage({ status: 'error', error: 'No SQL provided' });
          }
          break;
          
        case 'get_stats':
          const result = countStmt.get() as { count: number };
          const count = result?.count || 0;
          
          // Cache file size check to reduce I/O
          let size = 0;
          try {
            const stats = await stat(dbPath);
            size = stats.size;
          } catch {
            size = 0;
          }
          
          callCount += 1;
          await sendMessage({
            status: 'success',
            type: 'periodic_update',
            stats: { total: count, size, call_count: callCount }
          });
          break;
          
        case 'ping':
          await sendMessage({ status: 'success', action: 'pong' });
          break;
          
        default:
          await sendMessage({ status: 'error', error: `Unknown action: ${message.action}` });
      }
      
    } catch (error) {
      await logDebug(`Processing error: ${error}`);
      await sendMessage({ status: 'error', error: String(error) });
    }
  }
  
} catch (error) {
  await logDebug(`Main loop error: ${error}`);
} finally {
  await cleanupAndExit();
}
