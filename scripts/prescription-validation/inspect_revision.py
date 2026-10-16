#!/usr/bin/env python3
"""One read-only metadata check. Never call application, SQL or secret APIs."""
import json
import os
import re
import subprocess
from urllib.parse import urlsplit, parse_qs

PROJECT = "realign-lab-app"
REGION = "us-central1"
REVISION = "hormonehealthai-00578-7kl"
INSTANCE = "cliniq-rx-stage-c73ac1bc32"
CONNECTION = f"{PROJECT}:{REGION}:{INSTANCE}"
COMMAND = ["gcloud", "--quiet", "--verbosity=error", f"--project={PROJECT}",
           "run", "revisions", "describe", REVISION, f"--region={REGION}", "--format=json"]
DB_KEYS = ("DATABASE_URL", "NEON_DATABASE_URL", "PGHOST", "DB_HOST")


class InspectionError(ValueError):
    """Only fixed, non-sensitive messages may be used with this exception."""


def summarize(data):
    """Never return raw env, error bodies, URLs, secret refs or request bodies."""
    metadata = data.get("metadata", {})
    if metadata.get("name") != REVISION:
        raise InspectionError("Revision identity mismatch; no test calls authorized.")
    annotations = metadata.get("annotations", {})
    labels = metadata.get("labels", {})
    location = labels.get("cloud.googleapis.com/location")
    if location and location != REGION:
        raise InspectionError("Revision region contradicts the requested region.")
    service = labels.get("serving.knative.dev/service")
    if service != "hormonehealthai":
        raise InspectionError("Revision service identity is missing or contradictory.")
    containers = data.get("spec", {}).get("containers", [])
    if len(containers) != 1:
        raise InspectionError("Unexpected container configuration; stop for review.")
    digests = {match.group(0) for value in
               (containers[0].get("image", ""), data.get("status", {}).get("imageDigest", ""))
               if isinstance(value, str) and (match := re.search(r"sha256:[a-f0-9]{64}$", value))}
    env_rows = containers[0].get("env", [])
    env = {row["name"]: row for row in env_rows}
    if len(env) != len(env_rows):
        raise InspectionError("Duplicate environment names; stop for review.")
    bindings = [value.strip() for value in annotations.get("run.googleapis.com/cloudsql-instances", "").split(",") if value.strip()]
    database = {}
    for name in DB_KEYS:
        row = env.get(name)
        if not row:
            continue
        if "valueFrom" in row:
            database[name] = "SECRET_REFERENCE_UNRESOLVED"
            continue
        value = row.get("value", "")
        if name.endswith("_URL"):
            try:
                parsed = urlsplit(value)
                hosts = parse_qs(parsed.query).get("host", [parsed.hostname or ""])
                host = hosts[0] if len(hosts) == 1 else ""
            except ValueError:
                host = ""
        else:
            host = value
        database[name] = "EXACT_STAGING_SOCKET" if host == "/cloudsql/" + CONNECTION else "TARGET_NOT_INDEPENDENTLY_VERIFIED"
    def setting(name, boolean=False):
        row = env.get(name, {})
        if "valueFrom" in row:
            return "SECRET_REFERENCE_UNRESOLVED"
        value = row.get("value", "")
        if boolean:
            return "ENABLED" if value == "true" else "DISABLED_OR_UNSET" if value in ("false", "") else "UNRECOGNIZED"
        return "CONFIGURED_VALUE_REDACTED" if value else "UNSET"
    return {
        "status": "READ_ONLY_METADATA_ONLY_NO_TEST_WRITES_AUTHORIZED",
        "revision": REVISION, "projectRequested": PROJECT, "regionRequested": REGION,
        "productionNamedService": service, "cloudSqlBindingOnlyExactStaging": bindings == [CONNECTION],
        "sourceImageDigest": next(iter(digests)) if len(digests) == 1 else "UNVERIFIED_OR_CONTRADICTORY",
        "productionSqlBindingPresent": any(binding.endswith(":realign-app") or binding.endswith(":realign-app-new") for binding in bindings),
        "databaseTargets": database, "signingSetting": setting("PRESCRIPTION_SIGNING_APPROVED", True),
        "pdfBucket": setting("PRESCRIPTION_PDF_BUCKET"),
        "noncontrolledCatalog": setting("PRESCRIPTION_NONCONTROLLED_CATALOG_PATH"),
        "blockers": [
            "Revision name/tag is NOT evidence of isolated data.",
            "Metadata cannot prove database contents, synthetic account isolation, private bucket IAM or source provenance.",
            "No secret payloads were accessed. Unresolved database targets require review before any application writes.",
            "Administrator reset is not authorized; use the existing approval gate only if access recovery is necessary.",
        ],
    }


def main():
    environment = {**os.environ, "CLOUDSDK_CORE_DISABLE_PROMPTS": "1",
                   "CLOUDSDK_CORE_LOG_HTTP": "false", "CLOUDSDK_CORE_DISABLE_FILE_LOGGING": "true",
                   "CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK": "true"}
    try:
        result = subprocess.run(COMMAND, capture_output=True, timeout=90, env=environment)
        if result.returncode:
            raise InspectionError(f"Read-only revision describe failed (SDK exit {result.returncode}); verify account/project access locally. SDK body suppressed.")
        output = summarize(json.loads(result.stdout))
        print(json.dumps(output, indent=2))
    except InspectionError as error:
        print("STOPPED: " + str(error) + " No test writes attempted.")
        return 1
    except subprocess.TimeoutExpired:
        print("STOPPED: Revision metadata read exceeded 90 seconds. No test writes attempted.")
        return 1
    except (ValueError, KeyError, TypeError, AttributeError, OSError):
        print("STOPPED: Revision metadata could not be safely verified. No SQL, secret payload, application or mutation calls attempted.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
