#!/usr/bin/env python3
import sys
import json
import struct
import sqlite3
import os
from datetime import datetime

# Add logging to a file for debugging
def log_debug(message):
    with open('native_app_debug.log', 'a', encoding='utf-8') as f:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        f.write(f"[{timestamp}] {message}\n")
        f.flush()

log_debug("=== Native app starting ===")

def read_message():
    try:
        log_debug("Waiting for message...")
        # Read 4-byte message length
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length or len(raw_length) < 4:
            log_debug(f"No data or insufficient length: {len(raw_length) if raw_length else 0}")
            return None
        
        message_length = struct.unpack('=I', raw_length)[0]
        log_debug(f"Message length: {message_length}")
        
        if message_length == 0:
            log_debug("Zero length message")
            return None
            
        message = sys.stdin.buffer.read(message_length).decode('utf-8')
        log_debug(f"Raw message: {message}")
        parsed = json.loads(message)
        log_debug(f"Parsed message: {parsed}")
        return parsed
    except Exception as e:
        log_debug(f"Exception in read_message: {e}")
        return None

def send_message(message):
    try:
        log_debug(f"Sending message: {message}")
        encoded = json.dumps(message).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
        log_debug("Message sent successfully")
    except Exception as e:
        log_debug(f"Exception in send_message: {e}")
        sys.exit(0)

def cleanup_and_exit():
    """Clean up resources and exit gracefully"""
    log_debug("Cleaning up and exiting")
    try:
        conn.close()
    except:
        pass
    sys.exit(0)

log_debug("Initializing database...")

# Initialize SQLite with better path handling
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tweets.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute('''
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
''')
conn.commit()

log_debug("Database initialized, sending ready message...")

# Send initial ready message
send_message({'status': 'ready', 'type': 'startup'})
call_count = 0

log_debug("Entering main loop...")

# Main message loop
try:
    while True:
        message = read_message()
        if message is None:
            log_debug("Received None message, breaking loop")
            break
        
        log_debug(f"Processing message: {message}")
        
        try:
            if message['action'] == 'store_tweet':
                log_debug("Processing store_tweet")
                tweet = message['tweet']
                log_debug(f"Tweet data received: {tweet}")
                
                # Extract data according to new TweetData structure
                originator_id = tweet.get('originator_id', '')
                timestamp = tweet.get('timestamp', '')
                tweet_type = tweet.get('type', '')
                
                # Ensure data is properly JSON stringified
                raw_data = tweet.get('data', '')
                if isinstance(raw_data, dict):
                    data = json.dumps(raw_data)
                elif isinstance(raw_data, str):
                    data = raw_data
                else:
                    data = str(raw_data) if raw_data else ''
                    
                user_id = tweet.get('user_id', '')
                canSendToCA = tweet.get('canSendToCA', None)
                reason = tweet.get('reason', '') or None  # Convert empty string to None for SQLite
                date_added = tweet.get('date_added', '')
                
                cursor.execute('''
                    INSERT OR REPLACE INTO tweets 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    originator_id,
                    timestamp,
                    tweet_type,
                    data,
                    user_id,
                    canSendToCA,
                    reason,
                    date_added
                ))
                conn.commit()
                send_message({'status': 'success', 'id': originator_id})
            
            elif message['action'] == 'query':
                log_debug("Processing query")
                sql = message.get('sql', '')
                if sql:
                    cursor.execute(sql)
                    results = cursor.fetchall()
                    send_message({'status': 'success', 'results': results})
                else:
                    send_message({'status': 'error', 'error': 'No SQL provided'})
            
            elif message['action'] == 'get_stats':
                log_debug("Processing get_stats")
                cursor.execute('SELECT COUNT(*) FROM tweets')
                count = cursor.fetchone()[0]
                # Get database file size
                db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
                call_count += 1
                send_message({
                    'status': 'success', 
                    'type': 'periodic_update',
                    'stats': {'total': count, 'size': db_size, 'call_count': call_count}
                })
            
            elif message['action'] == 'ping':
                log_debug("Processing ping")
                send_message({'status': 'success', 'action': 'pong'})
                
            elif message['action'] == 'forward_to_native':
                log_debug("Processing forward_to_native")
                # Write the forwarded data to a file with timestamp
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                filename = f"forwarded_data_{timestamp}.json"
                
                try:
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(message, f, indent=2, ensure_ascii=False)
                    log_debug(f"Data written to file: {filename}")
                except Exception as file_error:
                    log_debug(f"Error writing to file: {str(file_error)}")
                
                send_message({'status': 'success', 'action': 'forward_to_native'})
            
            else:
                log_debug(f"Unknown action: {message['action']}")
                send_message({'status': 'error', 'error': f'Unknown action: {message["action"]}'})
                
        except Exception as e:
            log_debug(f"Exception processing message: {e}")
            send_message({'status': 'error', 'error': str(e)})

except Exception as e:
    log_debug(f"Exception in main loop: {e}")
finally:
    cleanup_and_exit()