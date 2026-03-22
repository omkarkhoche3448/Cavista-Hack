# Frontend ↔ Backend Mapping

## Auth Module

| Frontend Component | Frontend API Call | Backend Endpoint | Database | Status |
|---|---|---|---|---|
| `AuthContext` | `fetchProfile` | `GET /api/auth/me` | `users` | OK |
| `Onboarding` | `onboardPatient` | `POST /api/auth/onboard` | `users`, `patient_profiles` | OK |
| `Onboarding`, `FileUploadModal` | `uploadDocument` | `POST /api/documents` | `medical_documents` | OK |
| `PatientProfilePage` / `DoctorProfilePage` | `updateProfile` | `PATCH /api/auth/me` | `users` | OK |

## Sessions Module

| Frontend Component | Frontend API Call | Backend Endpoint | Database | Status |
|---|---|---|---|---|
| `DoctorDashboard` | `createSession` | `POST /api/sessions` | `sessions`, `notifications` | OK |
| `DoctorDashboard`, `PatientDashboard`, `Sessions` pages | `listSessions` | `GET /api/sessions` | `sessions`, `users` | OK |
| `Patients`, `IndividualPatient` | `listPatients`, `getPatient` | `GET /api/sessions/patients`, `GET /api/sessions/patients/{id}` | `sessions`, `users`, `patient_profiles` | OK |
| `DoctorCallPage`, `IndividualSession`, `PatientSessionPage` | `getSession` | `GET /api/sessions/{session_id}` | `sessions`, `users` | OK |
| `PatientDashboard`, notification components | `respondToSession` | `POST /api/sessions/respond` | `sessions`, `session_state_history` | OK |
| Doctor session pages | `startSession`, `endSession` | `POST /api/sessions/{id}/start`, `POST /api/sessions/end` | `sessions`, `session_state_history` | OK |
| `DoctorCallPage`, `IndividualSession` | `transcribeAudio` | `POST /api/sessions/transcribe` | `sessions`, `transcript_chunks` | OK |
| `SessionDetails` | `getRecordingUrl` | `GET /api/sessions/{id}/recording` | `sessions` | **Fixed** |
| Future/legacy consumer | `uploadRecording` | `POST /api/sessions/{id}/recording` | `sessions`, `transcript_chunks` | **Fixed** |

## Documents Module

| Frontend Component | Frontend API Call | Backend Endpoint | Database | Status |
|---|---|---|---|---|
| Patient dashboards/pages | `listDocuments`, `deleteDocument` | `GET /api/documents`, `DELETE /api/documents/{id}` | `medical_documents` | OK |
| Patient session pages | `shareDocuments` | `POST /api/documents/share` | `session_document_shares`, `pre_session_insights` | OK |
| Doctor session pages | `getSessionDocuments` | `GET /api/documents/session/{id}` | `session_document_shares`, `medical_documents` | OK |

## EMR Module

| Frontend Component | Frontend API Call | Backend Endpoint | Database | Status |
|---|---|---|---|---|
| `ReviewSession`, `SessionDetails` | `getEMRDrafts`, `getEMRDraft` | `GET /api/emr/drafts/{session_id}`, `GET /api/emr/draft/{draft_id}` | `emr_drafts` | OK |
| `ReviewSession` | `approveEMR` | `POST /api/emr/approve` | `emr_drafts`, `final_emrs`, `patient_summaries` | **Fixed (summary availability sync)** |
| `ReviewSession` | `getEMRPdfUrl` | `GET /api/emr/pdf/{session_id}` | `final_emrs` | OK |
| Doctor session pages | `getInsights` | `GET /api/emr/insights/{session_id}` | `pre_session_insights` | OK |
| Patient session pages | `getPatientSummary` | `GET /api/emr/patient-summary/{session_id}` | `patient_summaries` | OK |
| EMR service contract | `getICDMappings` | `GET /api/emr/icd-mappings/{session_id}` | `icd_mappings` | **Fixed** |
| EMR service contract | `updateICDMapping` | `PATCH /api/emr/icd-mappings/{mapping_id}?action=` | `icd_mappings` | **Fixed** |
| EMR service contract | `getTreatments` | `GET /api/emr/treatments/{session_id}` | `treatment_suggestions` | **Fixed** |
| EMR service contract | `approveTreatment` | `POST /api/emr/treatments/approve` | `treatment_suggestions` | **Fixed** |
| EMR service contract | `approvePatientSummary` | `POST /api/emr/patient-summary/approve` | `patient_summaries` | **Fixed** |

## Contract Standardization

- Frontend now sends `X-Api-Envelope: 1` on API calls.
- Backend wraps responses into:
  - `{ "success": true, "message": null, "data": ..., "error": null }`
  - `{ "success": false, "message": "...", "data": null, "error": ... }`
- Legacy clients without the header keep existing raw response format.
