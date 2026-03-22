from __future__ import annotations

import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from ..config.settings import settings

logger = logging.getLogger(__name__)
_s3_client = None


def _get_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _s3_client


def upload_file(content: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    if not settings.AWS_S3_BUCKET:
        raise RuntimeError("AWS_S3_BUCKET is not configured.")
    client = _get_client()
    client.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    logger.info("Uploaded file to S3 key=%s", key)
    return key


def generate_presigned_url(key: str, expiry: int = 3600) -> str:
    if not settings.AWS_S3_BUCKET:
        return ""
    client = _get_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET, "Key": key},
            ExpiresIn=expiry,
        )
    except (ClientError, BotoCoreError) as error:
        logger.error("Failed to generate presigned url key=%s error=%s", key, error)
        return ""

