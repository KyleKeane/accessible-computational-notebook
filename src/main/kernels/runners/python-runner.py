"""Python kernel runner.

Speaks JSON lines on stdin/stdout:
  in:  {"id": n, "type": "execute", "code": "..."}
  out: {"id": n, "type": "stream", "name": "stdout"|"stderr", "text": "..."}   (during execution)
       {"id": n, "type": "result", "status": "ok"|"error",
        "outputs": [...], "executionCount": n}

It can also call back into the app while a cell runs (the `notebook` object
available to user code):
  out: {"type": "api", "apiId": n, "method": "...", "args": {...}}
  in:  {"type": "api-result", "apiId": n, "value": ..., "error": null}

The user namespace persists for the life of the process (one kernel = one
session). User stdout/stderr are redirected to stream messages during
execution, so user prints can never corrupt the protocol. If the cell's last
statement is an expression, its repr() is returned as an execute_result
(Jupyter semantics). SIGINT interrupts a running cell via KeyboardInterrupt.
"""

import ast
import collections
import contextlib
import io
import json
import sys
import traceback

PROTO_OUT = sys.stdout
# Messages read from stdin while waiting for an api-result (e.g. queued
# execute requests) are buffered here for the main loop.
PENDING_MESSAGES = collections.deque()

execution_count = 0
current_execute_id = None


def send(message):
    PROTO_OUT.write(json.dumps(message) + "\n")
    PROTO_OUT.flush()


def read_message():
    if PENDING_MESSAGES:
        return PENDING_MESSAGES.popleft()
    while True:
        line = sys.stdin.readline()
        if not line:
            return None  # EOF
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue


class StreamWriter(io.TextIOBase):
    """Replaces sys.stdout/sys.stderr during execution; every write becomes
    a protocol stream message tagged with the running execution id."""

    def __init__(self, name):
        self.name = name

    def writable(self):
        return True

    def write(self, text):
        if text:
            send({
                "id": current_execute_id,
                "type": "stream",
                "name": self.name,
                "text": str(text),
            })
        return len(text)


class NotebookAPI:
    """Lets notebook code manipulate the notebook itself. Cell indices are
    0-based. Raises RuntimeError if the app reports an error."""

    def __init__(self):
        self._next_api_id = 0

    def _call(self, method, **args):
        self._next_api_id += 1
        api_id = self._next_api_id
        send({"type": "api", "apiId": api_id, "method": method, "args": args})
        while True:
            message = None
            if PENDING_MESSAGES:
                message = PENDING_MESSAGES.popleft()
            else:
                line = sys.stdin.readline()
                if not line:
                    raise RuntimeError("Notebook connection closed")
                line = line.strip()
                if not line:
                    continue
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
            if message.get("type") == "api-result" and message.get("apiId") == api_id:
                if message.get("error"):
                    raise RuntimeError(message["error"])
                return message.get("value")
            PENDING_MESSAGES.append(message)

    def cell_count(self):
        return self._call("cell_count")

    def get_cells(self):
        return self._call("get_cells")

    def get_source(self, index):
        return self._call("get_source", index=index)

    def set_source(self, index, source):
        return self._call("set_source", index=index, source=source)

    def insert_cell(self, source="", type="code", index=None):
        return self._call("insert_cell", source=source, type=type, index=index)

    def delete_cell(self, index):
        return self._call("delete_cell", index=index)


namespace = {"__name__": "__main__", "notebook": NotebookAPI()}


def run_cell(code):
    outputs = []
    status = "ok"
    try:
        tree = ast.parse(code, "<cell>", "exec")
        trailing_expr = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            trailing_expr = ast.Expression(tree.body.pop().value)
        stdout, stderr = StreamWriter("stdout"), StreamWriter("stderr")
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if tree.body:
                exec(compile(tree, "<cell>", "exec"), namespace)
            if trailing_expr is not None:
                value = eval(compile(trailing_expr, "<cell>", "eval"), namespace)
                if value is not None:
                    namespace["_"] = value
                    outputs.append({"type": "execute_result", "text": repr(value)})
    except KeyboardInterrupt:
        status = "error"
        outputs.append({
            "type": "error",
            "ename": "KeyboardInterrupt",
            "evalue": "Execution interrupted",
            "traceback": "KeyboardInterrupt: execution interrupted by user",
        })
    except BaseException as exc:  # noqa: BLE001 - report any user error
        status = "error"
        outputs.append({
            "type": "error",
            "ename": type(exc).__name__,
            "evalue": str(exc),
            "traceback": traceback.format_exc(),
        })
    return status, outputs


def main():
    global execution_count, current_execute_id
    while True:
        # A SIGINT that arrives while idle (blocked on readline) must not
        # kill the kernel; only a SIGINT during run_cell interrupts a cell.
        try:
            message = read_message()
        except KeyboardInterrupt:
            continue
        if message is None:
            break
        if message.get("type") != "execute":
            continue
        execution_count += 1
        current_execute_id = message.get("id")
        status, outputs = run_cell(message.get("code", ""))
        send({
            "id": message.get("id"),
            "type": "result",
            "status": status,
            "outputs": outputs,
            "executionCount": execution_count,
        })
        current_execute_id = None


if __name__ == "__main__":
    main()
