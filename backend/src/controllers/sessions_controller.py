from __future__ import annotations

import json
import logging

from fastapi import BackgroundTasks, Depends, File, Form, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi import HTTPException
from supabase import Client

from ..config.database import get_supabase
from ..models.schemas import (
    CreateSessionRequest,
    EndSessionRequest,
    PaginatedSessionsResponse,
    SessionAcceptReject,
    SessionResponse,
)
from ..services.auth_dependencies import decode_ws_token, get_current_user, require_role
from ..services.session_service import (
    create_session as create_session_service,
    end_session as end_session_service,
    get_patient_detail as get_patient_detail_service,
    get_recording_url as get_recording_url_service,
    get_session_detail as get_session_detail_service,
    get_session_notifications as get_session_notifications_service,
    get_transcript as get_transcript_service,
    handle_ws_event,
    list_patients as list_patients_service,
    list_sessions as list_sessions_service,
    respond_to_session as respond_to_session_service,
    start_session as start_session_service,
    transcribe_audio as transcribe_audio_service,
    upload_recording as upload_recording_service,
)
from ..services.websocket_manager import manager

logger = logging.getLogger(__name__)


async def websocket_endpoint(websocket: WebSocket, token: str = Query(...), supabase: Client = Depends(get_supabase)):
    user_id = "unknown"
    try:
        payload = decode_ws_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=1008, reason="Invalid token payload")
            return

        await websocket.accept()
        connection_id = await manager.connect(websocket, user_id)
        await manager.send_to_user(user_id, "CONNECTED", {"connection_id": connection_id, "user_id": user_id})

        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_to_user(user_id, "ERROR", {"message": "Invalid JSON payload."})
                continue
            await handle_ws_event(user_id, str(message.get("event", "")), message.get("data", {}) or {}, supabase)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except HTTPException as error:
        logger.warning("WS auth failed user=%s detail=%s", user_id, error.detail)
        try:
            await websocket.close(code=1008, reason=str(error.detail))
        except Exception:
            pass
    except Exception as error:
        logger.exception("WS error user=%s error=%s", user_id, error)
        manager.disconnect(websocket)


async def create_session(
    body: CreateSessionRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> SessionResponse:
    return await create_session_service(body, current_user, supabase)


async def respond_to_session(
    body: SessionAcceptReject,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await respond_to_session_service(body, current_user, supabase)


async def start_session(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await start_session_service(session_id, current_user, supabase)


async def end_session(
    body: EndSessionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await end_session_service(body, background_tasks, current_user, supabase)


def list_sessions(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> PaginatedSessionsResponse:
    return list_sessions_service(
        status_filter=status_filter,
        page=page,
        page_size=page_size,
        current_user=current_user,
        supabase=supabase,
    )


def list_patients(
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    return list_patients_service(current_user=current_user, supabase=supabase)


def get_patient_detail(
    patient_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return get_patient_detail_service(patient_id, current_user=current_user, supabase=supabase)


async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await get_session_detail_service(session_id, current_user=current_user, supabase=supabase)


def get_recording_url(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return get_recording_url_service(session_id, current_user=current_user, supabase=supabase)


def get_transcript(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    return get_transcript_service(session_id, current_user=current_user, supabase=supabase)


async def upload_recording(
    session_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await upload_recording_service(
        background_tasks=background_tasks,
        session_id=session_id,
        file=file,
        current_user=current_user,
        supabase=supabase,
    )


def get_session_notifications(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    return get_session_notifications_service(session_id, current_user=current_user, supabase=supabase)


async def transcribe_audio(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await transcribe_audio_service(
        background_tasks=background_tasks,
        session_id=session_id,
        file=file,
        current_user=current_user,
        supabase=supabase,
    )
