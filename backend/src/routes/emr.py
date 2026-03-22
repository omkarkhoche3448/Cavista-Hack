from fastapi import APIRouter

from ..controllers import emr_controller
from ..models.schemas import EMRDraftResponse, ICDMappingResponse, PreSessionInsightResponse, TreatmentSuggestionResponse

router = APIRouter(prefix="/api/emr", tags=["emr"])

router.get("/drafts/{session_id}", response_model=list[EMRDraftResponse])(emr_controller.get_emr_drafts)
router.get("/draft/{draft_id}")(emr_controller.get_emr_draft)
router.post("/approve")(emr_controller.approve_emr)
router.get("/pdf/{session_id}")(emr_controller.get_emr_pdf_url)
router.get("/patient-summary/{session_id}")(emr_controller.get_patient_summary)
router.post("/patient-summary/approve")(emr_controller.approve_patient_summary)
router.get("/icd-mappings/{session_id}", response_model=list[ICDMappingResponse])(emr_controller.get_icd_mappings)
router.patch("/icd-mappings/{mapping_id}")(emr_controller.update_icd_mapping)
router.get("/treatments/{session_id}", response_model=list[TreatmentSuggestionResponse])(emr_controller.get_treatments)
router.post("/treatments/approve")(emr_controller.approve_treatment)
router.get("/insights/{session_id}", response_model=list[PreSessionInsightResponse])(emr_controller.get_insights)
router.get("/notifications")(emr_controller.get_notifications)
router.patch("/notifications/{notification_id}/read")(emr_controller.mark_notification_read)
