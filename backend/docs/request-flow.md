# Backend Request Flow Map

## Authentication
- `POST /api/auth/signup` -> `src/routes/auth.py` -> `controllers/auth_controller.signup` -> `services/auth_service.signup` -> `supabase.auth.sign_up` + `public.users` trigger.
- `POST /api/auth/login` -> `auth_controller.login` -> `auth_service.login` -> `supabase.auth.sign_in_with_password` -> `public.users` lookup.
- `PATCH /api/auth/me` -> `auth_controller.update_profile` -> `auth_service.update_profile` -> `repositories/auth_repository.update_user_profile` -> `public.users`.

## Sessions
- `POST /api/sessions` -> `sessions_controller.create_session` -> `session_service.create_session` -> `session_repository.create_session_record` -> `public.sessions`, `public.notifications`.
- `POST /api/sessions/respond` -> `session_service.respond_to_session` -> `public.sessions`, `public.session_state_history`.
- `POST /api/sessions/{session_id}/start` -> `session_service.start_session` -> `public.sessions`, `public.session_state_history`.
- `POST /api/sessions/end` -> `session_service.end_session` -> `public.sessions`, background `run_ai_pipeline`.
- `GET /api/sessions` -> `session_service.list_sessions` -> `session_repository.list_sessions_for_user` -> `public.sessions` + `public.users` joins.
- `GET /api/sessions/{session_id}/transcript` -> `session_service.get_transcript` -> `public.transcript_chunks`.
- `POST /api/sessions/transcribe` -> `session_service.transcribe_audio` -> S3 upload + `public.sessions.recording_url` + background transcription.

## Documents
- `POST /api/documents` -> `document_service.upload_document` -> S3 upload + `public.medical_documents` + background AI analysis update.
- `POST /api/documents/share` -> `document_service.share_documents` -> `public.session_document_shares` + `public.pre_session_insights`.
- `GET /api/documents/{id}` -> `document_service.get_document` -> strict patient/doctor share authorization checks.

## EMR
- `GET /api/emr/drafts/{session_id}` -> `emr_service.get_emr_drafts` -> `public.emr_drafts` (doctor ownership verified).
- `POST /api/emr/approve` -> `emr_service.approve_emr` -> `public.emr_drafts`, `public.final_emrs`, `public.sessions` + background PDF generation/upload.
- `GET /api/emr/patient-summary/{session_id}` -> `emr_service.get_patient_summary` -> `public.patient_summaries`.
- `GET /api/emr/notifications` and `PATCH /api/emr/notifications/{id}/read` -> `public.notifications`.

## Notes
- `/api/notes` CRUD -> `note_service` -> `repositories/note_repository` -> `public.doctor_notes`.

## WebSocket
- `GET /api/sessions/ws?token=<jwt>` -> `sessions_controller.websocket_endpoint` -> `auth_dependencies.decode_ws_token` -> `session_service.handle_ws_event`.
- Event `TRANSCRIPT_CHUNK` now verifies session membership before insert/broadcast.
