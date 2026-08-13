#!/usr/bin/env python3
import os
import sys
import time
import subprocess
import signal
import unittest

WRAPPER_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'parent_monitor_wrapper.py'))

class TestParentMonitorWrapper(unittest.TestCase):
    def test_normal_child_exit(self):
        """When the child exits normally, the wrapper exits with the same code."""
        p = subprocess.Popen([sys.executable, WRAPPER_PATH, '--parent-pid', str(os.getpid()), 'true'])
        p.wait(timeout=5)
        self.assertEqual(p.returncode, 0)

    def test_abnormal_child_exit(self):
        """When the child exits with an error, the wrapper exits with the same error code."""
        # Using a python one-liner to exit with 42
        p = subprocess.Popen([sys.executable, WRAPPER_PATH, '--parent-pid', str(os.getpid()), sys.executable, '-c', 'import sys; sys.exit(42)'])
        p.wait(timeout=5)
        self.assertEqual(p.returncode, 42)

    def test_sigterm_propagation(self):
        """When the wrapper receives SIGTERM, it terminates the child and exits."""
        # Spawn wrapper with a long-running child
        p = subprocess.Popen([sys.executable, WRAPPER_PATH, '--parent-pid', str(os.getpid()), 'sleep', '60'])
        
        # Give it a moment to start
        time.sleep(0.5)
        
        # Send SIGTERM to the wrapper
        p.terminate()
        p.wait(timeout=5)
        
        # The wrapper should have exited with 128 + 15 (SIGTERM) = 143
        self.assertEqual(p.returncode, 143)

    def test_parent_crash_simulation(self):
        """When the parent process dies, the wrapper terminates itself and the child."""
        # We will spawn a dummy parent process that will spawn the wrapper, and then the dummy parent exits.
        # The dummy parent will write the wrapper's child pid (grandchild) and the wrapper pid to stdout.
        
        dummy_parent_code = f"""import subprocess, os, sys, time
# Spawn wrapper with sleep 100
p = subprocess.Popen([{repr(sys.executable)}, {repr(WRAPPER_PATH)}, '--parent-pid', str(os.getpid()), 'sleep', '100'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
# Print my PID and the wrapper's PID
print(f"PARENT_PID:{{os.getpid()}} WRAPPER_PID:{{p.pid}}", flush=True)
time.sleep(0.5)
# Exit parent abruptly
sys.exit(0)
"""
        parent_proc = subprocess.Popen([sys.executable, '-c', dummy_parent_code], stdout=subprocess.PIPE, text=True)
        line = parent_proc.stdout.readline().strip()
        self.assertTrue(line.startswith("PARENT_PID:"))
        
        # Parse PIDs
        parts = line.split()
        parent_pid = int(parts[0].split(':')[1])
        wrapper_pid = int(parts[1].split(':')[1])
        
        # Wait for the dummy parent to exit
        parent_proc.wait(timeout=5)
        self.assertEqual(parent_proc.returncode, 0)
        
        # Now, the parent process is dead. The wrapper should detect this and exit, also killing 'sleep 100'.
        # Let's wait a bit for the wrapper to run its check loop and terminate.
        time.sleep(2.0)
        
        # Verify wrapper is dead
        try:
            os.kill(wrapper_pid, 0)
            wrapper_alive = True
        except OSError:
            wrapper_alive = False
        self.assertFalse(wrapper_alive, "Wrapper process should have terminated after parent died.")
        
        # Check if any lingering sleep processes are orphaned.
        # Since 'sleep 100' was the grandchild, let's verify if there's any sleep 100 run by our user.
        # In a real system, the PDEATHSIG should have killed the grandchild.
        # Let's search if there's any child process of the wrapper or sleep process running.
        # We can run `pgrep -f "sleep 100"` or similar to check if it's dead.
        try:
            out = subprocess.check_output(['pgrep', '-f', 'sleep 100'], text=True)
            sleep_alive = len(out.strip().split()) > 0
        except subprocess.CalledProcessError:
            sleep_alive = False
            
        self.assertFalse(sleep_alive, "Grandchild 'sleep 100' should have been terminated.")

if __name__ == '__main__':
    unittest.main()
