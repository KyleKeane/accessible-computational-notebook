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


# `_` is the last result; Out[n] is the result of execution n (Wolfram's
# %n / IPython's Out[n]).
namespace = {"__name__": "__main__", "notebook": NotebookAPI(), "Out": {}}

# ---------- kernel intelligence: inspect / complete / docs ----------

HIDDEN_NAMES = {"notebook", "Out", "__name__", "__builtins__"}


def describe_value(value):
    type_name = type(value).__name__
    extra = ""
    try:
        if hasattr(value, "shape"):
            extra = f", shape {tuple(value.shape)}"
        elif hasattr(value, "__len__") and not isinstance(value, type):
            extra = f", length {len(value)}"
    except Exception:  # noqa: BLE001
        pass
    try:
        preview = repr(value)
    except Exception:  # noqa: BLE001
        preview = "<unrepresentable>"
    if len(preview) > 80:
        preview = preview[:77] + "..."
    return type_name + extra, preview


def inspect_variables():
    import types
    variables = []
    for name in sorted(namespace):
        if name.startswith("_") or name in HIDDEN_NAMES:
            continue
        value = namespace[name]
        if isinstance(value, types.ModuleType):
            variables.append({"name": name, "type": "module", "preview": getattr(value, "__name__", "")})
            continue
        type_info, preview = describe_value(value)
        variables.append({"name": name, "type": type_info, "preview": preview})
    return variables


SYMBOL_RE = r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.?$"


def symbol_before(code, cursor):
    import re
    match = re.search(SYMBOL_RE, code[:cursor])
    return match.group(0) if match else ""


def complete(code, cursor):
    import builtins
    import keyword
    symbol = symbol_before(code, cursor)
    if "." in symbol:
        base, _, prefix = symbol.rpartition(".")
        try:
            obj = eval(base, namespace)  # noqa: S307 - same model as Jupyter
            candidates = dir(obj)
        except Exception:  # noqa: BLE001
            return {"matches": [], "replaceFrom": cursor}
    else:
        prefix = symbol
        candidates = list(namespace) + dir(builtins) + keyword.kwlist
    matches = sorted({c for c in candidates if c.startswith(prefix) and (prefix or not c.startswith("_"))})
    return {"matches": matches[:200], "replaceFrom": cursor - len(prefix)}


def docs_for(code, cursor):
    import inspect as _inspect
    symbol = symbol_before(code, cursor).rstrip(".")
    if not symbol:
        return {"symbol": "", "text": "No symbol at the cursor"}
    try:
        obj = eval(symbol, namespace)  # noqa: S307
    except Exception:  # noqa: BLE001
        return {"symbol": symbol, "text": f"{symbol} is not defined"}
    parts = []
    try:
        parts.append(f"{symbol}{_inspect.signature(obj)}")
    except (TypeError, ValueError):
        type_info, preview = describe_value(obj)
        parts.append(f"{symbol}: {type_info} = {preview}")
    doc = _inspect.getdoc(obj)
    if doc:
        parts.append(doc)
    return {"symbol": symbol, "text": "\n\n".join(parts)}



def run_cell(code, exec_count=None):
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
                    if exec_count is not None:
                        namespace["Out"][exec_count] = value
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
        kind = message.get("type")
        if kind == "chdir":
            try:
                import os
                os.chdir(message.get("path", "."))
            except OSError:
                pass
            continue
        if kind == "inspect":
            send({"id": message.get("id"), "type": "inspect-result",
                  "variables": inspect_variables()})
            continue
        if kind == "complete":
            result = complete(message.get("code", ""), message.get("cursor", 0))
            send({"id": message.get("id"), "type": "complete-result", **result})
            continue
        if kind == "docs":
            result = docs_for(message.get("code", ""), message.get("cursor", 0))
            send({"id": message.get("id"), "type": "docs-result", **result})
            continue
        if kind != "execute":
            continue
        execution_count += 1
        current_execute_id = message.get("id")
        status, outputs = run_cell(message.get("code", ""), execution_count)
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
