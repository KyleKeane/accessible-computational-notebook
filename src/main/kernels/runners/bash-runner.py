"""Bash kernel runner.

Speaks the same JSON-lines protocol as the other runners. Each cell runs in
a fresh `bash -c` process, but variables, functions, and the working
directory persist between cells through an explicit state snapshot
(`declare -p` / `declare -f` sourced at the start of the next cell) — no
interactive REPL scraping, the failure mode this project was rebuilt to
avoid.

stdout/stderr stream live, line by line. A non-zero exit status is reported
as a structured error. SIGINT interrupts the running cell (the whole process
group); SIGTERM cleans up children before exiting.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading

PROTO = sys.stdout
STATE_DIR = tempfile.mkdtemp(prefix="notebook-bash-")
STATE_FILE = os.path.join(STATE_DIR, "state.sh")
CWD_FILE = os.path.join(STATE_DIR, "cwd")

execution_count = 0
current_process = None


def send(message):
    PROTO.write(json.dumps(message) + "\n")
    PROTO.flush()


def cleanup_and_exit(*_args):
    if current_process is not None and current_process.poll() is None:
        try:
            os.killpg(os.getpgid(current_process.pid), signal.SIGTERM)
        except OSError:
            pass
    shutil.rmtree(STATE_DIR, ignore_errors=True)
    sys.exit(0)


signal.signal(signal.SIGTERM, cleanup_and_exit)


def wrap(code):
    # Readonly variables (BASHOPTS, UID, …) would error when re-sourced, so
    # they are filtered out of the snapshot.
    return f"""
if [ -f {CWD_FILE!r} ]; then cd "$(cat {CWD_FILE!r})" 2>/dev/null; fi
if [ -f {STATE_FILE!r} ]; then source {STATE_FILE!r} 2>/dev/null; fi
{code}
__notebook_rc=$?
{{ declare -p | grep -Ev '^declare -[a-zA-Z]*r[a-zA-Z]* ' ; declare -f ; }} > {STATE_FILE!r}.tmp 2>/dev/null
mv {STATE_FILE!r}.tmp {STATE_FILE!r} 2>/dev/null
pwd > {CWD_FILE!r}
exit $__notebook_rc
"""


def pump(pipe, name, exec_id):
    for line in iter(pipe.readline, ""):
        send({"id": exec_id, "type": "stream", "name": name, "text": line})
    pipe.close()


def run_cell(code, exec_id):
    global current_process
    process = subprocess.Popen(
        ["bash", "-c", wrap(code)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        errors="replace",
        start_new_session=True,  # its own group: interrupts hit cell, not us
    )
    current_process = process
    readers = [
        threading.Thread(target=pump, args=(process.stdout, "stdout", exec_id)),
        threading.Thread(target=pump, args=(process.stderr, "stderr", exec_id)),
    ]
    for reader in readers:
        reader.start()

    interrupted = False
    while True:
        try:
            returncode = process.wait()
            break
        except KeyboardInterrupt:
            interrupted = True
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGINT)
            except OSError:
                pass
            try:
                returncode = process.wait(timeout=2)
                break
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                except OSError:
                    pass
    for reader in readers:
        reader.join()
    current_process = None

    if interrupted:
        message = "Command interrupted"
        return "error", [{
            "type": "error",
            "ename": "KeyboardInterrupt",
            "evalue": message,
            "traceback": message,
        }]
    if returncode != 0:
        message = f"Command exited with status {returncode}"
        return "error", [{
            "type": "error",
            "ename": "ExitStatus",
            "evalue": message,
            "traceback": message,
        }]
    return "ok", []


def main():
    global execution_count
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            continue
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("type") != "execute":
            continue
        execution_count += 1
        status, outputs = run_cell(message.get("code", ""), message.get("id"))
        send({
            "id": message.get("id"),
            "type": "result",
            "status": status,
            "outputs": outputs,
            "executionCount": execution_count,
        })
    cleanup_and_exit()


if __name__ == "__main__":
    main()
