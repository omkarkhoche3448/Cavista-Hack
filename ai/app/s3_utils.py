from __future__ import annotations

from typing import Optional, Tuple, Any
from urllib.parse import urlparse


def parse_s3_url(url: str) -> Optional[Tuple[str, str]]:
    """
    Parse an S3 URL and return (bucket, key).

    Supports:
      - s3://bucket/key
      - https://bucket.s3.amazonaws.com/key
      - https://bucket.s3.region.amazonaws.com/key
      - https://s3.amazonaws.com/bucket/key
      - https://s3.region.amazonaws.com/bucket/key
    Returns None if not an S3 URL.
    """
    parsed = urlparse(url)

    if parsed.scheme == "s3":
        return parsed.netloc, parsed.path.lstrip("/")

    if parsed.hostname and ".s3" in parsed.hostname and "amazonaws.com" in parsed.hostname:
        bucket = parsed.hostname.split(".s3")[0]
        key = parsed.path.lstrip("/")
        return bucket, key

    if parsed.hostname and parsed.hostname.startswith("s3") and "amazonaws.com" in parsed.hostname:
        parts = parsed.path.lstrip("/").split("/", 1)
        if len(parts) == 2:
            return parts[0], parts[1]

    return None


def get_s3_client(settings: Any):
    """
    Create an authenticated boto3 S3 client.

    Passes AWS credentials only when provided to allow IAM-role based auth in containers.
    """
    try:
        import boto3  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError("boto3 is required for S3 downloads") from e

    client_kwargs = {"region_name": getattr(settings, "AWS_REGION", None) or None}
    access_key = getattr(settings, "AWS_ACCESS_KEY_ID", "") or ""
    secret_key = getattr(settings, "AWS_SECRET_ACCESS_KEY", "") or ""
    if access_key and secret_key:
        client_kwargs["aws_access_key_id"] = access_key
        client_kwargs["aws_secret_access_key"] = secret_key

    return boto3.client("s3", **client_kwargs)

