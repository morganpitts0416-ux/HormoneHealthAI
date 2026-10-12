"""Sanitized command diagnostics and strict read-only production metadata checks."""
import json
import re
import shlex
import subprocess

SERVICE = "hormonehealthai"
REGION = re.compile(r"^[a-z]+(?:-[a-z0-9]+)+[0-9]$")
REVISION = re.compile(r"^hormonehealthai-[a-z0-9-]{1,80}$")


class RunnerFailure(RuntimeError):
    pass


def sanitize(value):
    text = str(value)
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = "".join(character for character in text if character in "\n\t" or ord(character) >= 32)
    text = re.sub(r"-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----",
                  "[PRIVATE KEY REDACTED]", text, flags=re.S)
    text = re.sub(r"(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|https?)://[^\s/]+@[^\s]*",
                  "[CREDENTIAL URL REDACTED]", text)
    text = re.sub(r"(?i)\bBearer\s+\S+", "Bearer [REDACTED]", text)
    text = re.sub(r"\b(?:ya29\.[\w.-]+|1//[\w.-]+|sk-[\w-]{20,}|ghp_[\w]+|github_pat_[\w]+|AIza[\w-]+)",
                  "[TOKEN REDACTED]", text)
    text = re.sub(r'''(?ix)(["']?(?:password|passwd|access_token|refresh_token|client_secret|private_key|api_key|secret|token)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)''',
                  r"\1[REDACTED]", text)
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[EMAIL REDACTED]", text)
    return text[:6000]


def safe_command(argv):
    safe, hide_next = [], False
    for arg in argv:
        if hide_next:
            safe.append("[REDACTED]")
            hide_next = False
            continue
        name, separator, _value = arg.partition("=")
        if name.startswith("--") and re.search(r"password|token|secret|credential|api-key|set-env-vars", name, re.I):
            safe.append(name + ("=[REDACTED]" if separator else ""))
            hide_next = not separator
        else:
            safe.append(sanitize(arg))
    return shlex.join(safe)


def command_hint(stderr):
    text = stderr.lower()
    if "permission_denied" in text or "permission denied" in text or "forbidden" in text:
        return "The active account needs read access to the named resource; do not change production IAM as a workaround."
    if "not_found" in text or "not found" in text:
        return "Check the project, service and verified region named in this command; do not substitute another production service."
    if "regional endpoints" in text:
        return "Pass --region with the independently verified production service region; global discovery is blocked by SDK endpoint policy."
    if "unrecognized arguments" in text or "invalid choice" in text:
        return "The installed Google Cloud SDK rejected these arguments; use the supported SDK command shown."
    if "credential" in text or "authentication" in text or "login" in text:
        return "Use the normal Google Cloud SDK browser/OAuth login in Cloud Shell; never paste credentials into chat."
    return "Inspect this sanitized diagnostic and the protected operator log; the runner has stopped, not bypassed the check."


class CommandRunner:
    def __init__(self, log, environment):
        self.log, self.environment = log, environment
        self.last_command = None

    def note(self, text):
        self.log.write(sanitize(text) + "\n")
        self.log.flush()

    def __call__(self, argv, capture=False, env=None, cwd=None):
        self.last_command = safe_command(argv)
        self.note("COMMAND: " + self.last_command)
        try:
            result = subprocess.run(argv, stdout=subprocess.PIPE if capture else self.log,
                                    stderr=subprocess.PIPE, env=env if env is not None else self.environment(),
                                    cwd=cwd, text=True)
        except OSError as error:
            raise RunnerFailure("Could not launch command: " + sanitize(error) +
                                ". Check that this executable is installed in Cloud Shell.") from None
        self.note(f"EXIT: {result.returncode}; captured stdout characters: {len(result.stdout or '')}")
        detail = sanitize(result.stderr or "").strip()
        if detail:
            self.note("STDERR: " + detail)
        if result.returncode:
            raise RunnerFailure(f"Command exited {result.returncode}: {detail or 'No stderr was emitted.'}\n"
                                + command_hint(detail))
        return result.stdout.strip() if capture else None


def metadata_json(text, operation):
    try:
        value = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        raise RunnerFailure(operation + " did not return valid JSON. Check the shown SDK command and its JSON projection; no raw response was logged.") from None
    return value


def service_name(row):
    if not isinstance(row, dict):
        raise RunnerFailure("Cloud Run list contains a non-object entry; expected SDK service metadata.")
    metadata = row.get("metadata") or {}
    if not isinstance(metadata, dict):
        raise RunnerFailure("Cloud Run metadata is not an object; expected SDK service metadata.")
    names = [v.rstrip("/").split("/")[-1] for v in (
        row.get("id"), row.get("name"), metadata.get("name")
    ) if isinstance(v, str) and v]
    if not names:
        raise RunnerFailure("Cloud Run service identity is missing. The list projection must include id, name or metadata.name.")
    if len(set(names)) != 1:
        raise RunnerFailure("Cloud Run service identity fields disagree; refusing ambiguous production metadata.")
    return names[0]


def service_regions(row):
    metadata = row.get("metadata") or {}
    labels = metadata.get("labels") or {}
    if not isinstance(labels, dict):
        raise RunnerFailure("Cloud Run metadata.labels is not an object.")
    values = [row.get("region"), row.get("location"), labels.get("cloud.googleapis.com/location")]
    for field in (row.get("name"), metadata.get("name")):
        if isinstance(field, str):
            match = re.search(r"/locations/([^/]+)/services/", field)
            if match:
                values.append(match.group(1))
    regions = set()
    for value in values:
        if value is None or value == "":
            continue
        if not isinstance(value, str) or not REGION.fullmatch(value):
            raise RunnerFailure("Cloud Run region metadata has an unsupported format; refusing to infer or guess a region.")
        regions.add(value)
    if len(regions) > 1:
        raise RunnerFailure("Cloud Run region fields disagree; refusing ambiguous production metadata.")
    return regions


def discover_region(services):
    if not isinstance(services, list):
        raise RunnerFailure("Cloud Run service list is not a JSON array. Check the shown SDK list command.")
    matches = [row for row in services if service_name(row) == SERVICE]
    if len(matches) != 1:
        raise RunnerFailure(f"Found {len(matches)} matches for {SERVICE}; expected exactly one in the selected project. "
                            "Use --region only with an independently verified region; do not choose a different service.")
    regions = service_regions(matches[0])
    if not regions:
        raise RunnerFailure("Production service has no region metadata. Expected SDK region, location, location label or qualified resource name. "
                            "Use --region only with an independently verified production region.")
    return regions.pop()


def validate_production_metadata(before, region, expected_revision):
    if not isinstance(before, dict) or service_name(before) != SERVICE:
        raise RunnerFailure("Cloud Run describe did not identify the expected production service.")
    regions = service_regions(before)
    if regions and regions != {region}:
        raise RunnerFailure("Described production region differs from the requested region; stopped.")
    status = before.get("status")
    if not isinstance(status, dict):
        raise RunnerFailure("Production status is missing from Cloud Run describe. Include status.traffic and status.latestReadyRevisionName in the projection.")
    ready = status.get("latestReadyRevisionName")
    if not isinstance(ready, str) or not REVISION.fullmatch(ready):
        raise RunnerFailure("Production latestReadyRevisionName is missing or invalid; no revision can be independently verified.")
    if ready != expected_revision:
        raise RunnerFailure(f"Production revision mismatch: expected {expected_revision}; observed {ready}. "
                            "Reconcile the source with this independently observed revision before retrying; do not change the expected baseline merely to continue.")
    traffic = status.get("traffic")
    if not isinstance(traffic, list) or not traffic:
        raise RunnerFailure("Production traffic metadata is missing; cannot verify the live baseline.")
    total = 0
    for entry in traffic:
        if not isinstance(entry, dict):
            raise RunnerFailure("Production traffic entry is invalid.")
        percent = entry.get("percent", 0 if entry.get("tag") else None)
        if type(percent) is not int or not 0 <= percent <= 100:
            raise RunnerFailure("Production traffic percentage is missing or invalid.")
        revision = entry.get("revisionName")
        if revision is None and entry.get("latestRevision") is True:
            revision = ready
        if percent and revision != expected_revision:
            observed = revision if isinstance(revision, str) and REVISION.fullmatch(revision) else "<unverified revision>"
            raise RunnerFailure(f"Production traffic mismatch: positive traffic reaches {observed}, not {expected_revision}. Reconcile production source/traffic before retrying.")
        total += percent
    if total != 100:
        raise RunnerFailure("Production traffic does not independently account for 100%; stopped before staging resource creation.")
