from fastapi import APIRouter

from ..controllers import documents_controller
from ..models.schemas import DocumentResponse

router = APIRouter(prefix="/api/documents", tags=["documents"])

router.post("", response_model=DocumentResponse, status_code=201)(documents_controller.upload_document)
router.get("", response_model=list[DocumentResponse])(documents_controller.list_documents)
router.post("/share")(documents_controller.share_documents)
router.get("/session/{session_id}")(documents_controller.get_session_documents)
router.get("/{document_id}", response_model=DocumentResponse)(documents_controller.get_document)
router.delete("/{document_id}", status_code=204)(documents_controller.delete_document)
router.get("/{document_id}/analysis")(documents_controller.get_document_analysis)
