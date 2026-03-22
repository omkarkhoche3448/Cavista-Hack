from fastapi import APIRouter

from ..controllers import notes_controller
from ..models.schemas import NoteResponse

router = APIRouter(prefix="/api/notes", tags=["notes"])

router.post("", response_model=NoteResponse, status_code=201)(notes_controller.create_note)
router.get("", response_model=list[NoteResponse])(notes_controller.list_notes)
router.get("/{note_id}", response_model=NoteResponse)(notes_controller.get_note)
router.put("/{note_id}", response_model=NoteResponse)(notes_controller.update_note)
router.delete("/{note_id}", status_code=204)(notes_controller.delete_note)

