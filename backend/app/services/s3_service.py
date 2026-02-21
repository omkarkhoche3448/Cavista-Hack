"""
S3 Service — upload files to AWS S3 and generate presigned URLs.
"""

import logging
import boto3
from botocore.exceptions import ClientError

from ..config import settings

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
    """Upload bytes to S3. Returns the key on success."""
    client = _get_client()
    client.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    logger.info(f"S3 upload ok: {key}")
    return key



def generate_presigned_url(key: str, expiry: int = 3600) -> str:
    """Generate a presigned GET URL for an S3 object."""
    client = _get_client()
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET, "Key": key},
            ExpiresIn=expiry,
        )
        return url
    except ClientError as e:
        logger.error(f"Presigned URL failed for {key}: {e}")
        return ""
