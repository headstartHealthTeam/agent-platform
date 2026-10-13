import { publicResearchManifestLimits } from '@headstart-health/workflow-contracts';

/** Credential-free stdlib check for the native research sandbox (which intentionally has no private runtime). */
export function publicResearchPreflightScript(): string {
  return `import datetime, hashlib, json, pathlib, re, sys, urllib.parse
limits = json.loads(${JSON.stringify(JSON.stringify(publicResearchManifestLimits))})
manifest_path = pathlib.Path(sys.argv[1])
class PreflightError(ValueError):
    pass
def require(ok, code, index=None):
    if not ok:
        suffix = "" if index is None else " at file entry " + str(index + 1)
        raise PreflightError(code + suffix)
def text(value, maximum):
    return isinstance(value, str) and len(value.encode("utf-16-le", errors="surrogatepass")) // 2 <= maximum
def matches(value, pattern):
    return isinstance(value, str) and re.fullmatch(pattern, value, flags=re.ASCII) is not None
try:
    raw = manifest_path.read_bytes()
    require(len(raw) <= limits["bytes"], "manifest-size")
    value = json.loads(raw.decode("utf-8"))
    require(isinstance(value, dict), "manifest-shape")
    require(text(value.get("summary"), limits["summary"]), "summary")
    limitations = value.get("limitations")
    require(isinstance(limitations, list) and len(limitations) <= limits["limitations"], "limitations")
    require(all(text(item, limits["limitation"]) for item in limitations), "limitation-length")
    files = value.get("files")
    require(isinstance(files, list) and len(files) <= limits["files"], "files")
    paths = set()
    for index, item in enumerate(files):
        require(isinstance(item, dict), "file-shape", index)
        path = item.get("path")
        require(matches(path, limits["pathPattern"]) and not path.endswith("/manifest.json"), "path", index)
        require(path not in paths, "duplicate-path", index)
        paths.add(path)
        for field in ("title", "url"):
            require(text(item.get(field), limits[field]), field, index)
        require("statedDate" in item and (item["statedDate"] is None or text(item["statedDate"], limits["statedDate"])), "statedDate", index)
        for field in ("mediaType", "digest"):
            require(matches(item.get(field), limits[field + "Pattern"]), field, index)
        timestamp = item.get("retrievedAt")
        require(matches(timestamp, limits["timestampPattern"]), "file-timestamp", index)
        datetime.datetime.strptime(timestamp[:19], "%Y-%m-%dT%H:%M:%S")
        url = urllib.parse.urlsplit(item["url"])
        require(url.scheme in ("http", "https") and bool(url.hostname) and not url.username and not url.password, "file-url", index)
        original_path = manifest_path.parent / path.rsplit("/", 1)[1]
        require(not original_path.is_symlink(), "original-symlink", index)
        require(original_path.is_file(), "original-missing", index)
        require(0 < original_path.stat().st_size <= limits["originalBytes"], "original-size", index)
        original = original_path.read_bytes()
        require(len(original) <= limits["originalBytes"], "original-size", index)
        require("sha256:" + hashlib.sha256(original).hexdigest() == item["digest"], "digest-mismatch", index)
    print("Public research preflight passed: " + str(len(files)) + " complete originals checked.")
except PreflightError as error:
    print("Public research preflight failed: " + str(error), file=sys.stderr)
    sys.exit(1)
except (ValueError, OSError, UnicodeError, TypeError, OverflowError):
    # Never echo source values, document bytes, URLs or filesystem error messages.
    print("Public research preflight failed; check the named manifest fields and original bytes against the contract.", file=sys.stderr)
    sys.exit(1)
`;
}
