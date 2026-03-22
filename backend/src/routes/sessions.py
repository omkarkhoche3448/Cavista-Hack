from fastapi import APIRouter

from ..controllers import sessions_controller
from ..models.schemas import PaginatedSessionsResponse, SessionResponse

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

router.websocket("/ws")(sessions_controller.websocket_endpoint)
router.post("", response_model=SessionResponse, status_code=201)(sessions_controller.create_session)
router.post("/respond")(sessions_controller.respond_to_session)
router.post("/{session_id}/start")(sessions_controller.start_session)
router.post("/end")(sessions_controller.end_session)
router.get("", response_model=PaginatedSessionsResponse)(sessions_controller.list_sessions)
router.get("/patients")(sessions_controller.list_patients)
router.get("/patients/{patient_id}")(sessions_controller.get_patient_detail)
router.post("/{session_id}/recording")(sessions_controller.upload_recording)
router.get("/{session_id}/recording")(sessions_controller.get_recording_url)
router.get("/{session_id}")(sessions_controller.get_session)
router.get("/{session_id}/transcript")(sessions_controller.get_transcript)
router.get("/{session_id}/notifications")(sessions_controller.get_session_notifications)
router.post("/transcribe")(sessions_controller.transcribe_audio)
