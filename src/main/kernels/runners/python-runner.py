"""Python kernel runner.

Speaks JSON lines on stdin/stdout:
  in:  {"id": n, "type": "execute", "code": "..."}
  out: {"id": n, "type": "result", "status": "ok"|"error",
        "outputs": [...], "executionCount": n}

The user namespace persists for the life of the process (one kernel = one
session). User stdout/stderr are redirected to buffers during execution so
they can never corrupt the protocol stream. If the cell's last statement is
an expression, its repr() is returned as an execute_result (Jupyter
semantics). SIGINT interrupts a running cell via KeyboardInterrupt.
"""

import ast
import contextlib
import io
import json
import sys
import traceback

namespace = {"__name__": "__main__"}
execution_count = 0


def run_cell(code):
    stdout, stderr = io.StringIO(), io.StringIO()
    outputs = []
    status = "ok"
    try:
        tree = ast.parse(code, "<cell>", "exec")
        trailing_expr = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            trailing_expr = ast.Expression(tree.body.pop().value)
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
        tb = traceback.format_exc()
        outputs.append({
            "type": "error",
            "ename": type(exc).__name__,
            "evalue": str(exc),
            "traceback": tb,
        })

    streams = []
    if stdout.getvalue():
        streams.append({"type": "stream", "name": "stdout", "text": stdout.getvalue()})
    if stderr.getvalue():
        streams.append({"type": "stream", "name": "stderr", "text": stderr.getvalue()})
    return status, streams + outputs


def main():
    global execution_count
    while True:
        # A SIGINT that arrives while idle (blocked on readline) must not
        # kill the kernel; only a SIGINT during run_cell interrupts a cell.
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
        status, outputs = run_cell(message.get("code", ""))
        response = {
            "id": message.get("id"),
            "type": "result",
            "status": status,
            "outputs": outputs,
            "executionCount": execution_count,
        }
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
