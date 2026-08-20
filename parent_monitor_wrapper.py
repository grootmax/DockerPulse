#!/usr/bin/env python3
import sys
import os
import time
import subprocess
import signal
import threading

child_proc = None

def forward_triggers(proc):
    try:
        for _ in proc.stdout:
            sys.stdout.write("1\n")
            sys.stdout.flush()
    except Exception:
        pass

def get_libc():
    import ctypes
    for name in (None, 'libc.so.6', 'libc.so'):
        try:
            libc = ctypes.CDLL(name)
            if libc:
                return libc
        except Exception:
            continue
    return None

def set_pdeathsig():
    try:
        libc = get_libc()
        if libc:
            # PR_SET_PDEATHSIG is 1. We request SIGKILL (9) when parent dies.
            libc.prctl(1, 9, 0, 0, 0)
    except Exception:
        pass

def is_pid_alive(pid):
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def handle_signal(signum, frame):
    global child_proc
    if child_proc:
        try:
            child_proc.terminate()
            child_proc.wait(timeout=0.2)
        except subprocess.TimeoutExpired:
            try:
                child_proc.kill()
            except Exception:
                pass
        except Exception:
            pass
    sys.exit(128 + signum)

def main():
    global child_proc
    
    # Parse arguments
    # Usage: parent_monitor_wrapper.py [--parent-pid PID] <cmd> [args...]
    args = sys.argv[1:]
    parent_pid = None
    
    if len(args) >= 2 and args[0] == '--parent-pid':
        try:
            parent_pid = int(args[1])
            cmd_args = args[2:]
        except ValueError:
            parent_pid = None
            cmd_args = args
    elif len(args) >= 1:
        # Check if first arg is an integer
        try:
            parent_pid = int(args[0])
            cmd_args = args[1:]
        except ValueError:
            parent_pid = None
            cmd_args = args
    else:
        print("Usage: parent_monitor_wrapper.py [--parent-pid PID] <cmd> [args...]", file=sys.stderr)
        sys.exit(1)
        
    if parent_pid is None:
        # Fallback to getppid()
        parent_pid = os.getppid()
        
    if not cmd_args:
        print("Error: No command specified to run.", file=sys.stderr)
        sys.exit(1)
        
    # Register signal handlers
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    # Spawn child process
    try:
        child_proc = subprocess.Popen(cmd_args, stdout=subprocess.PIPE, stderr=sys.stderr, text=True, bufsize=1, preexec_fn=set_pdeathsig)
    except Exception as e:
        print(f"Error spawning child process: {e}", file=sys.stderr)
        sys.exit(1)
        
    trigger_thread = threading.Thread(target=forward_triggers, args=(child_proc,), daemon=True)
    trigger_thread.start()
        
    # Monitor loop
    try:
        while True:
            # Check child status
            child_exit_code = child_proc.poll()
            if child_exit_code is not None:
                sys.exit(child_exit_code)
                
            # Check parent status
            # If current process is orphaned (PPID changes to 1/systemd) or parent PID is no longer alive
            if os.getppid() != parent_pid or not is_pid_alive(parent_pid):
                # Parent died! Clean up child and exit
                try:
                    child_proc.terminate()
                    child_proc.wait(timeout=0.2)
                except subprocess.TimeoutExpired:
                    try:
                        child_proc.kill()
                    except Exception:
                        pass
                except Exception:
                    pass
                sys.exit(1)
                
            time.sleep(0.5)
    except KeyboardInterrupt:
        handle_signal(signal.SIGINT, None)

if __name__ == '__main__':
    main()
