import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

from .response_envelope import error_envelope, wants_envelope

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        if wants_envelope(request):
            return JSONResponse(
                status_code=exc.status_code,
                content=error_envelope(message=str(exc.detail), error={"detail": exc.detail}),
                headers=exc.headers,
            )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        if wants_envelope(request):
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content=error_envelope(
                    message="Validation failed.",
                    error={"errors": exc.errors()},
                ),
            )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": "Validation failed.", "errors": exc.errors()},
        )

    @app.exception_handler(APIError)
    async def postgrest_exception_handler(request: Request, exc: APIError):
        logger.exception("Database API error on %s %s: %s", request.method, request.url.path, exc)
        if wants_envelope(request):
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=error_envelope(message="Database operation failed.", error={"code": exc.code}),
            )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Database operation failed."},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
        if wants_envelope(request):
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=error_envelope(message="Internal server error.", error={"type": "internal_error"}),
            )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error."},
        )
