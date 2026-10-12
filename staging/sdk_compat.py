"""Offline real-SDK parser checks of the actual runner command expressions.

Every probe has an intentionally unrecognized flag and no --help. Successful
validation means exit 2 rejecting *only* that flag, never command execution.
SDK config/credentials are isolated and all resources/passwords are synthetic.
"""
import ast
from concurrent.futures import ThreadPoolExecutor
import json
import os
import pathlib
import re
import subprocess
import tempfile
from diagnostics import RunnerFailure
from sql_instance import instance_arguments, SQL_DESCRIPTION

SENTINEL = "--cliniq-sdk-validation-only"
SDK_PROJECT = "synthetic-sdk-compatibility"


def literal(node, values):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name) and node.id in values:
        return values[node.id]
    if isinstance(node, ast.Subscript):
        return literal(node.value, values)[literal(node.slice, values)]
    if isinstance(node, ast.BinOp):
        left, right = literal(node.left, values), literal(node.right, values)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Div) and isinstance(left, pathlib.Path):
            return left / right
    if isinstance(node, (ast.List, ast.Tuple)):
        result = []
        for item in node.elts:
            result.extend(literal(item.value, values)) if isinstance(item, ast.Starred) else result.append(literal(item, values))
        return result
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "str" and len(node.args) == 1:
        return str(literal(node.args[0], values))
    raise RunnerFailure("SDK command expression has no safe synthetic evaluator; update compatibility fixtures before resource creation.")


def runner_probes(tools, root):
    """Derive every cloud()/gcloud proxy argument from real source, not a second catalog."""
    source = root / "source"
    source.mkdir()
    (source / "Dockerfile").write_text("FROM scratch\n")
    private = root / "private"
    private.mkdir(mode=0o700)
    fixture = private / "fixture"
    fixture.write_text("synthetic-sdk-only\n")
    password = "synthetic-sdk-parser-only"
    flags = private / "instance-flags.json"
    flags.write_text(json.dumps({"--root-password": password}))
    flags.chmod(0o600)
    name, region = "cliniq-rx-stage-c73ac1bc32", "us-central1"
    state = {
        "instance": name, "region": region, "service": name, "bucket": SDK_PROJECT + "-" + name,
        "service_account": name + "@" + SDK_PROJECT + ".iam.gserviceaccount.com",
        "connection_name": SDK_PROJECT + ":" + region + ":" + name,
        "image": region + "-docker.pkg.dev/" + SDK_PROJECT + "/" + name + "/app@sha256:" + "a" * 64,
        "http_proxy_port": 8099,
    }
    values = {
        "PROJECT": SDK_PROJECT, "PRODUCTION_REVISION": "hormonehealthai-00597-guv",
        "SQL_DESCRIPTION": SQL_DESCRIPTION, "name": name, "region": region,
        "nonce": "c73ac1bc32", "role": "cliniq_rx_pdf_c73ac1bc32", "state": state,
        "private": private, "source": source, "workspace": root, "file": fixture,
        "account": "synthetic@example.test", "member_type": "user:",
        "db_binding": name + "-database:1", "session_binding": name + "-session:1",
        "catalog_binding": name + "-catalog:1", "key": name + "/synthetic.pdf",
        "tag": region + "-docker.pkg.dev/" + SDK_PROJECT + "/" + name + "/app:synthetic",
        "argv": instance_arguments(name, region, flags),
    }
    probes = []
    for filename in ("run.py", "sql_instance.py"):
        tree = ast.parse((tools / filename).read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if isinstance(node.func, ast.Name) and node.func.id == "cloud":
                args = []
                for argument in node.args:
                    args.extend(literal(argument.value, values)) if isinstance(argument, ast.Starred) else args.append(literal(argument, values))
                probes.append(args)
            elif (isinstance(node.func, ast.Attribute) and node.func.attr == "Popen" and node.args
                  and isinstance(node.args[0], ast.List) and node.args[0].elts
                  and isinstance(node.args[0].elts[0], ast.Constant) and node.args[0].elts[0].value == "gcloud"):
                args = literal(node.args[0], values)[1:]
                # The shared synthetic project flag is applied below.
                probes.append([arg for arg in args if not arg.startswith("--project=")])
    unique = list(dict.fromkeys(tuple(probe) for probe in probes))
    if not unique:
        raise RunnerFailure("No SDK commands discovered; compatibility coverage is invalid.")
    return [list(probe) for probe in unique]


def probe_command(argv, environment):
    if any(arg == "--" or arg.startswith("--help") or arg == SENTINEL for arg in argv):
        raise RunnerFailure("SDK compatibility probe would bypass mandatory parser rejection.")
    result = subprocess.run(["gcloud", "--quiet", "--project=" + SDK_PROJECT, *argv, SENTINEL],
                            env=environment, capture_output=True, text=True, timeout=90)
    match = re.search(r"unrecognized arguments:(.*?)(?:To search the help text|$)", result.stderr or "", re.S)
    rejected = set(re.findall(r"--[a-zA-Z][a-zA-Z0-9-]*", match.group(1))) if match else set()
    if result.returncode != 2 or rejected != {SENTINEL}:
        # Never print response bodies or fixture values. Show only command route/flag names.
        route = " ".join(arg for arg in argv[:4] if not arg.startswith("--") and not "/" in arg)
        extra = ", ".join(sorted(rejected - {SENTINEL})) or "unverified parser response"
        raise RunnerFailure(f"Installed SDK compatibility failed for {route}: {extra}; exit {result.returncode}. "
                            "Stopped before billable creation; --help success is not argument validation.")
    return {"command": " ".join(arg for arg in argv[:4] if not arg.startswith("--") and "/" not in arg),
            "flags": sorted({arg.split("=")[0] for arg in argv if arg.startswith("--")})}


def isolated_environment(environment, root):
    result = dict(environment)
    result["CLOUDSDK_CONFIG"] = str(root / "credential-free-sdk-config")
    result["CLOUDSDK_CORE_DISABLE_PROMPTS"] = "1"
    result["CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK"] = "true"
    result["CLOUDSDK_CORE_DISABLE_USAGE_REPORTING"] = "true"
    result.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
    result.pop("GOOGLE_OAUTH_ACCESS_TOKEN", None)
    return {key: value for key, value in result.items() if not key.startswith("CLOUDSDK_AUTH_")}


def validate_sdk(tools, environment, note=None):
    with tempfile.TemporaryDirectory(prefix="cliniq-sdk-offline-") as directory:
        root = pathlib.Path(directory)
        env = isolated_environment(environment, root)
        version = subprocess.run(["gcloud", "version", "--format=json"], env=env,
                                 capture_output=True, text=True, timeout=90)
        if version.returncode:
            raise RunnerFailure("Could not identify the installed SDK before compatibility checks.")
        try:
            sdk_version = json.loads(version.stdout).get("Google Cloud SDK")
        except (ValueError, AttributeError):
            raise RunnerFailure("Installed SDK version response is invalid.") from None
        if not isinstance(sdk_version, str):
            raise RunnerFailure("Installed SDK version was not independently identified.")
        probes = runner_probes(pathlib.Path(tools), root)
        with ThreadPoolExecutor(max_workers=4) as workers:
            checks = list(workers.map(lambda argv: probe_command(argv, env), probes))
        if note:
            note(f"OFFLINE SDK {sdk_version}: all {len(checks)} actual command shapes rejected only the parser sentinel; no commands executed.")
        return {"sdkVersion": sdk_version, "parserOnly": True, "credentialsIsolated": True,
                "checkedCommandShapes": len(checks), "checks": checks}
