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
    """
    Initializes and returns a singleton Boto3 S3 client.
    
    Why: Minimizes overhead by reusing the same S3 client across the application lifecycle.
    Where: Internal helper used by `upload_file` and `generate_presigned_url`.
    
    Returns:
        boto3.client: The S3 client instance.
    """
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
    """
    Uploads raw bytes to a specific S3 bucket and key.
    
    Why: Main entry point for storing user recordings and medical documents in the cloud.
    Where: Called by `sessions.py`: `transcribe_audio` and `documents.py`: `upload_document`.
    
    Args:
        content (bytes): The file content in bytes.
        key (str): The destination path/filename in S3.
        content_type (str, optional): MIME type of the file.
        
    Returns:
        str: The S3 key on successful upload.
    """
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
    """
    Generates a temporary presigned URL for secure access to an S3 object.
    
    Why: Provides time-limited, secure access to private S3 files for the frontend or external AI services without making the bucket public.
    Where: Called by `documents.py`: `_enrich_doc` and `sessions.py`: `run_ai_pipeline`.
    
    Args:
        key (str): The S3 key of the object.
        expiry (int, optional): URL expiration time in seconds. Defaults to 3600 (1 hour).
        
    Returns:
        str: The presigned URL, or an empty string if generation fails.
    """
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
