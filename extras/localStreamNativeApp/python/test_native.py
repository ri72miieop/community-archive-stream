#!/usr/bin/env python3
import json
import struct
import subprocess
import sys
import time

def test_native_app(message, script_path):
    print(f"Testing message: {message}")
    
    # Start the native app
    process = subprocess.Popen([
        sys.executable, script_path
    ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    def read_native_message(stdout):
        """Read a message in native messaging format"""
        try:
            # Read 4-byte length
            raw_length = stdout.read(4)
            if len(raw_length) < 4:
                return None
            
            length = struct.unpack('=I', raw_length)[0]
            if length == 0:
                return None
                
            # Read the message
            raw_message = stdout.read(length)
            return json.loads(raw_message.decode('utf-8'))
        except:
            return None
    
    def send_native_message(stdin, message):
        """Send a message in native messaging format"""
        encoded = json.dumps(message).encode('utf-8')
        length = struct.pack('=I', len(encoded))
        stdin.write(length + encoded)
        stdin.flush()
    
    try:
        # Read startup message
        startup_msg = read_native_message(process.stdout)
        print(f"Startup message: {startup_msg}")
        
        # Send our test message
        send_native_message(process.stdin, message)
        
        # Read response
        response = read_native_message(process.stdout)
        print(f"Response: {response}")
        
        # Close stdin to signal end
        process.stdin.close()
        
        # Wait for process to complete
        process.wait(timeout=5)
        
        return response
        
    except Exception as e:
        print(f"Error: {e}")
        process.terminate()
        return None

if __name__ == "__main__":
    print("=== Testing Native App ===")
    
    # Test ping
    print("\n1. Testing ping:")
    test_native_app({"action": "ping"}, "native_app.py")
    
    # Test invalid action
    print("\n2. Testing invalid action:")
    test_native_app({"action": "invalid"}, "native_app.py")
    
    # Test get_stats
    print("\n3. Testing get_stats:")
    test_native_app({"action": "get_stats"}, "native_app.py")

    print("\n4. Testing store_tweet with new TweetData structure:")
    test_tweet_data = {
        "originator_id": "test_tweet_123",
        "timestamp": "2025-09-10T13:30:00.000Z",
        "type": "HomeTimeline",
        "data": {"text": "This is a test tweet", "user": {"screen_name": "test_user"}},
        "user_id": "user_456",
        "canSendToCA": True,
        "reason": None,
        "date_added": "2025-09-10T13:30:00.000Z"
    }
    test_native_app({"action": "store_tweet", "tweet": test_tweet_data}, "native_app.py")